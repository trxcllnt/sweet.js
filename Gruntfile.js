module.exports = function(grunt) {
    var path = require("path");
    var exec = require("child_process").exec;
    var esfuzz= require("esfuzz");

    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-browserify');

    var moduleCache = {};

    grunt.initConfig({
        build: {
            dev: {
                options: {
                    sourceMap: false,
                    compileFrom: "./lib/sweet",
                },
                files: [{
                    expand: true,
                    cwd: "src/",
                    src: ["**/*.js"],
                    dest: "build/lib/"
                }]
            },
            release: {
                options: {
                    compileFrom: "./lib/sweet"
                },
                files: [{
                    expand: true,
                    cwd: "src/",
                    src: ["**/*.js"],
                    dest: "build/lib/"
                }]
            },
            tests: {
                options: {
                    compileFrom: "./build/lib/sweet"
                },
                files: [{
                    expand: true,
                    cwd: "test/",
                    src: ["**/test_*.js"],
                    dest: "build/"
                }]
            },
            unitTests: {
                options: {
                    compileFrom: "./build/lib/sweet",
                    sourceMap: false
                },
                files: [{
                    expand: true,
                    cwd: "test/units/",
                    src: ["**/test_*.js"],
                    dest: "build/units/"
                }]
            },
            test_modules: {
                options: {
                    compileFrom: "./build/lib/sweet",
                    readableNames: false
                },
                files: [{
                    expand: true,
                    cwd: "test/modules/",
                    src: ["**/test_*.js"],
                    dest: "build/modules/"
                }]
            },
            single: {
                options: {
                    sourceMap: false,
                    readableNames: false,
                    compileFrom: "./build/lib/sweet"
                },
                files: [{
                    expand: true,
                    cwd: "./",
                    src: ["test.js"],
                    dest: "build/"
                }]
            },
        },
        copy: {
            buildMacros: {
                expand: true,
                flatten: true,
                src: "macros/*",
                dest: "build/macros/"
            },

            scopedEval: {
                expand: true,
                flatten: true,
                src: "lib/scopedEval.js",
                dest: "build/lib/"
            },
            scopedEvalBrowser: {
                expand: true,
                flatten: true,
                src: "lib/scopedEval.js",
                dest: "browser/src/"
            },

            browserMacros: {
                expand: true,
                src: "macros/*",
                dest: "browser/src/"
            },

            browserSrc: {
                expand: true,
                cwd: "build/lib/",
                src: "**/*.js",
                dest: "browser/src/"
            },

            // for source maps support when using debug.js
            nodeSrc: {
                expand: true,
                flatten: true,
                src: "src/*",
                dest: "build/lib/src/"
            },

            dist: {
                expand: true,
                cwd: "build/lib/",
                src: "**/*.js",
                dest: "lib/"
            },
            testFixtures: {
                expand: true,
                flatten: false,
                cwd: "test/",
                src: "fixtures/**",
                dest: "build/"
            },
            testUnit: {
                src: "test/test_expander_units.js",
                dest: "build/test_expander_units.js"
            }
        },
        browserify: {
            editor: {
                src: ["browser/src/editor.js"],
                dest: "browser/scripts/editor.js",
                options: { debug: true },
                browserifyOptions: { debug: true }
            },
            "debugger": {
                src: ["browser/src/debugger.js"],
                dest: "browser/scripts/debugger.js",
                options: { debug: true },
                browserifyOptions: { debug: true }
            },
            sweeten: {
                src: ["browser/src/sweeten.js"],
                dest: "browser/scripts/sweeten.js",
                options: { debug: true },
                browserifyOptions: { debug: true }
            }
        },
        mochaTest: {
            test: {
                options:{
                    colors: !grunt.option('no-color')
                },
                src: ["build/*.js"]
            },
            es6: {
                options:{
                    colors: !grunt.option('no-color')
                },
                src: ["build/es6/**/*.js"]
            },
            modules: {
                options:{
                    colors: !grunt.option('no-color')
                },
                src: ["build/modules/*.js"],
            },
            units: {
                options:{
                    colors: !grunt.option('no-color')
                },
                src: ["build/units/**/*.js"]
            }
        },
        jshint: {
            options: {
                eqnull: true,
                evil: true,
                boss: true,
                laxcomma: true,
                shadow: true,
                loopfunc: true,
                validthis: true,
                globalstrict: true,
                strict: false
            },
            all: ["build/lib/*.js"]
        },
        pandoc: {
            options: {
                pandocOptions: ["--to=html5",  
                                "--standalone", 
                                "--toc", 
                                "--number-sections", 
                                "--include-in-header=doc/main/style/main.css"]
            },
            files: {
                expand: true,
                flatten: true,
                src: "doc/main/*.md",
                dest: "doc/main/",
                ext: ".html"
            }
        },
        watch: {
            docs: {
                files: ["doc/**/*.md", "doc/**/*.css"],
                tasks: ["pandoc"]
            },
            sweetjs: {
                files: ["src/*.js", "test/**/*.js", "macros/*"],
                tasks: ["default"]
            }
        }
    });

    grunt.registerMultiTask("pandoc", function() {
        var cb = this.async();
        var options = this.options({});
        var pandocOpts = options.pandocOptions.join(" ");
        this.files.forEach(function(f) {

            f.src.forEach(function(file) {
                var args = ["-o " + f.dest].concat(pandocOpts.slice())
                                          .concat(file);
                exec("pandoc " + args.join(" "), cb);
            });
        });
    });

    grunt.registerTask("clean", function() {
        grunt.file.delete("build/");
    });

    grunt.registerTask("fuzz", function() {
        var sweet = require("./build/lib/sweet");
        var i, iterations = 20;
        try {
            for (i = 0; i < iterations; i++) {
                var code = esfuzz.render(esfuzz.generate({maxDepth: 10}));
                // ignore `with` since we can't handle it anyway
                if (code.indexOf("with") !== -1) continue;
                sweet.compile(code);
            }
            console.log("done fuzzing");
        } catch (e) {
            console.log("On loop " + i + " attempted to expand:");
            console.log(code);
            console.log("\n" + e);
        }
    });


    grunt.registerMultiTask("build", function() {
        var options = this.options({
            modules: [],
            sourceMap: true,
            readableNames: true,
            compileFrom: "./lib/sweet"
        });
        var sweet = require(options.compileFrom);

        var modules = options.modules.map(function(m) {
            return sweet.loadModule(readModule(m));
        });

        this.files.forEach(function(f) {
            var dest = Array.isArray(f.dest) ? f.dest : [f.dest];
            // grunt.log.writeln("output to " + dest.join(", "));

            f.src.forEach(function(file) {
                grunt.log.writeln("compiling " + file);

                var code = grunt.file.read(file);

                var output = sweet.compile(code, {
                    sourceMap: options.sourceMap,
                    filename: file,
                    readableNames: options.readableNames,
                    modules: modules
                })[0];

                dest.forEach(function(dest) {
                    var sourceMappingURL = dest + ".map";
                    var outputFile;
                    if (options.sourceMap) {
                        outputFile = output.code + "\n//# sourceMappingURL=" + path.basename(file) + ".map";
                    } else {
                        outputFile = output.code;
                    }
                    // macro expanded result
                    grunt.file.write(dest,
                                     outputFile);
                    if (options.sourceMap) {
                        // sourcemap
                        grunt.file.write(sourceMappingURL,
                                         output.sourceMap);

                    }
                });

            });
        });
        
    });

    grunt.registerTask("dist", ["build:release", "copy:dist", "browserify"]);

    grunt.registerTask("test", ["build:tests",
                                "copy:testFixtures",
                                "mochaTest:test"]);

    grunt.registerTask("units", ["clean",
                                 "build:dev",
                                 "copy:scopedEval",
                                 "copy:buildMacros",
                                 "copy:nodeSrc",
                                 "build:unitTests",
                                 "mochaTest:units"]);

    grunt.registerTask("single", ["build:dev",
                                  "copy:scopedEval",
                                  "copy:buildMacros",
                                  "copy:nodeSrc",
                                  "build:single"]);

    grunt.registerTask("test_modules", ["build:dev",
                                        "build:test_modules",
                                        "copy:scopedEval",
                                        "copy:buildMacros",
                                        "copy:nodeSrc",
                                        "mochaTest:modules"]);

    grunt.registerTask("default", ["clean",
                                   "build:dev",

                                   "copy:scopedEval",
                                   "copy:buildMacros",
                                   "copy:nodeSrc",

                                   "copy:browserSrc",
                                   "copy:browserMacros",
                                   "copy:scopedEvalBrowser",

                                   "build:tests",

                                   "copy:testFixtures",

                                   "mochaTest:units",
                                   "mochaTest:test",
                                   "mochaTest:modules",
                                   "browserify"]);

    grunt.registerTask("full", ["default", "mochaTest:es6"]);
    grunt.registerTask("docs", ["pandoc"]);

    function readModule(mod) {
        var path = require.resolve(mod);
        return grunt.file.read(path);
    }
};
