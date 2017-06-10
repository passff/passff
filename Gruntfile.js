module.exports = function (grunt) {
  grunt.initConfig({
    ts: {
      built: {
        src: [
          "./src/**/*.ts",
          "./src/**/*.js",
          "./content/*.js",
        ],
        outDir: "./built/ts",
        options: {
          "rootDir": "./src",
          "noImplicitAny": true,
          "noImplicitReturns": true,
          "target": "es5",
          "allowJs": true,
          "lib": [
            "dom",
            "es6",
            "es2017"
          ]
        }
      },
    },
    mkdir: {
      all: {
        options: {
          create: ['built/content']
        },
      },
    },
    browserify: {
      built: {
        src: [
          "built/ts/background.js",
          "built/ts/content/popup.js",
          "built/ts/content/newPasswordWindow.js",
          "built/ts/content/preferencesWindow.js",
        ],
        dest: 'built/common.js',
        options: {
          browserifyOptions: {
            plugin: [
              ['factor-bundle', {
                outputs: [
                  "built/background.js",
                  "built/content/popup.js",
                  "built/content/newPasswordWindow.js",
                  "built/content/preferencesWindow.js"
                ]
              }]
            ],
            debug: false //  true for sourcemaps
          },
        }
      },
    },
    compress: {
      'xpi': {
        options: {
          archive: './bin/passff.xpi',
          mode: 'zip'
        },
        files: [
          {
            expand: true,
            cwd: './src/',
            src: [
              'manifest.json',
              'icon.png',
              '_locales/**/*',
              'content/**/*',
              'skin/**/*'
            ],
          },
          {
            expand: true,
            cwd: './built/',
            src: [
              'common.js',
              'background.js',
              'content/*.js'
            ],
          },
        ]
      }
    },
    watch: {
      scripts: {
        files: ["./src/**/*.ts", "./src/**/*.js"],
        tasks: ["build"]
      },
    },
  });

  grunt.loadNpmTasks("grunt-browserify");
  grunt.loadNpmTasks("grunt-ts");
  grunt.loadNpmTasks("grunt-mkdir");
  grunt.loadNpmTasks("grunt-contrib-compress");
  grunt.loadNpmTasks("grunt-contrib-watch");

  grunt.registerTask("default", ["watch"]);
  grunt.registerTask("build", ["ts:built", "mkdir:all", "browserify:built", "compress:xpi"]);
};