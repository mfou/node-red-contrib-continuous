
module.exports = function(RED) {
    "use strict";
    
    var exec = require('child_process').exec;
    var Promise = require('promise');
    var rimraf = require('rimraf');
    var stopFlashing = 0;
    
    var promiseCommand = function(cmd, path){ 
        return () => { 
            return new Promise((resolve, reject) => {
                var stdoutFull = "";
                var stderrFull = "";
                var child = exec(cmd, {cwd: path}, (err, stdout, stderr) => {
                    stdoutFull += stdout;
                    stdoutFull += stderr;
                    if (err) {
                        clearTimeout(stopFlashing);
                        reject(stdoutFull);
                    }
                    if(stdoutFull && stdoutFull != "") console.log(stdoutFull);
                });
                child.on("close", (code, signal) => {
                    clearTimeout(stopFlashing);
                    resolve(stdoutFull);
                })
            });
        };
    };
    
    //rm -rf directory with callback when truly end waiting the end
    var promiseRimraf = function(projectdir){ 
        return (logger)=>{ 
            return new Promise((resolve, reject) => {
                rimraf(projectdir, ()=>{
                    clearTimeout(stopFlashing);
                    resolve();
                });
            })
        }
    };
    
    function DeployNode(n) {
        
        RED.nodes.createNode(this,n);

        this.deploydir = n.deploydir; 
        this.projectname = n.projectname;
        this.branch = n.branch;
        this.giturl = n.giturl;

        var projectdir = this.deploydir + "/" + this.projectname;
        
        var node = this;
        node.status({});

        var pClone = promiseCommand('git clone -b ' + this.branch + ' ' + this.giturl + ' ' + this.projectname, this.deploydir);
        var pInstall = promiseCommand('npm install', projectdir);
        var pRimraf = promiseRimraf(projectdir);
    
        function setStatusFlash(status) {
            stopFlashing = setTimeout(() => {
                node.status(status);
                status.shape == 'dot' ? status.shape = 'ring' : status.shape = 'dot';
                setStatusFlash(status);
            }, 1000);
        }
    
        this.on('input', function (msg) {
            if(msg.payload && msg.payload.stats &&  msg.payload.stats.failures === 0){
                clearTimeout(stopFlashing);
                setStatusFlash({fill:"green",shape:"dot",text:"clean"});
                pRimraf()
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    setStatusFlash({fill:"green",shape:"dot",text:"clone"});
                    return pClone();
                })
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    setStatusFlash({fill:"green",shape:"dot",text:"install"});
                    return pInstall();
                })
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    node.status({fill:"green",shape:"dot",text:"end"});
                    var msg = {payload: "ok"};
                    this.send(msg);
                });
            }
            else{
                var msg = {payload: "not ready to deploy"};
                this.send(msg);
            }
        });

        this.on("close", function() {
        });
    }

    RED.nodes.registerType("deploy", DeployNode);
}

