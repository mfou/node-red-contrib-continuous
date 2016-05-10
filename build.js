
module.exports = function(RED) {
    "use strict";
    
    var exec = require('child_process').exec;
    var Promise = require('promise');
    var rimraf = require('rimraf');
    var stopFlashing = 0;
    var busy = false;
    
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
        return ()=>{ 
            return new Promise((resolve, reject) => {
                rimraf(projectdir, ()=>{
                    clearTimeout(stopFlashing);               
                    resolve();
                });
            })
        }
    };
    
    function BuildNode(n) {
        
        RED.nodes.createNode(this,n);

        this.builddirname = n.builddirname; 
        this.projectname = n.projectname;
        this.workspace = n.workspace;
        this.branch = n.branch;
        this.giturl = n.giturl;

        var builddir = this.workspace + this.builddirname;
        var projectdir = this.workspace + this.builddirname + "/" + this.projectname;
        
        var node = this;
        node.status({});

        var pClone = promiseCommand('git clone -b ' + this.branch + ' ' + this.giturl + ' ' + this.projectname, builddir);
        var pInstall = promiseCommand('npm install', projectdir);
        var pInstallGulp = promiseCommand('npm install -g gulp', projectdir);
        var pTest = promiseCommand('gulp test --silent', projectdir);
        var pRimraf = promiseRimraf(projectdir); 
    
        function setStatusFlash(status) {
            stopFlashing = setTimeout(() => {
                node.status(status);
                status.shape == 'dot' ? status.shape = 'ring' : status.shape = 'dot';
                setStatusFlash(status);
            }, 1000);
        }
        this.on('input', function (msg) {
            if(busy === false){
                busy = true;
                setStatusFlash({fill:"green",shape:"dot",text:"clean"});
                pRimraf()
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    setStatusFlash({fill:"green",shape:"dot",text:"clone"});
                    return pClone();})
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    setStatusFlash({fill:"green",shape:"dot",text:"install"});
                    return pInstall();})
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    setStatusFlash({fill:"green",shape:"dot",text:"install gulp"});
                    return pInstallGulp();})
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    setStatusFlash({fill:"green",shape:"dot",text:"run tests"});
                    return pTest();})
                .then((result)=>{
                    clearTimeout(stopFlashing);
                    node.status({fill:"green",shape:"dot",text:"ok"});
                    var msg = {payload: result};
                    this.send(msg);
                    busy = false; 
                });
            }
            else {
                logger.warn("there is already a build process");
            }
        });

        this.on("close", function() {
        });
    }

    RED.nodes.registerType("build", BuildNode);
}

