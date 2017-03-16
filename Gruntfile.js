/*
 * hippo Gruntfile
 *
 * Author(s):  Jonathan "Yoni" Knoll
 * Version:    0.20.1
 * Date:       2017-03-16
 *
 */

module.exports = function(grunt) {

  var pkg = grunt.file.readJSON('./package.json');

  // Project configuration
  grunt.initConfig({
    pkg: pkg,
    requirejs: {
      compile: {
        options: {
          baseUrl: './',
          name: 'hippo',
          findNestedDependencies: true,
          paths: {
            // these come from bower
            'emitter':              'bower_components/emitter/index',
            'json2':                'bower_components/json2',
            'lodash':               'bower_components/lodash/dist/lodash.min',
            'lodash-inflection':    'bower_components/lodash-inflection/lib/lodash-inflection',
            'lz-string':            'bower_components/lz-string/libs/lz-string.min',
            'text':                 'bower_components/requirejs-text/text' // this is needed because we *always* bring in templates or JSON
          },
          shim: {
            'lodash-inflection':    { deps: [ 'lodash' ] }
          },
          out: 'hippo.min.js'
        }
      }
    }
  });

  grunt.loadTasks('tasks');

  grunt.loadNpmTasks('grunt-contrib-requirejs');

  grunt.config('collect', ['find-tables'].concat(grunt.config('collect')));

  grunt.registerTask('build', function() {
    grunt.task.run('requirejs');
    grunt.file.write('VERSION', pkg.version);
  });

  console.log('\n');
};
