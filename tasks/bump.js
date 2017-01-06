/*
 * Provides bump.js as Grunt task
 *
 * Author(s):  Jonathan "Yoni" Knoll
 * Version:    0.18.1
 * Date:       2017-01-06
 *
 */

module.exports = function( grunt ) {
  'use strict';

  var colors = require('colors');

  grunt.registerTask('bump', function(version) {

    var currentVersion = grunt.config('pkg').version;

    switch(version) {
      case 'check':
        console.log('\nThe current version is ' + colors.cyan.bold(currentVersion) + '.');
        return;
      case 'patch':
        version = currentVersion.replace(/([0-9]+)$/, function(match, capture) {
          return +capture + 1;
        });
        break;
      case 'minor':
        version = currentVersion.replace(/(\d+)\.\d+$/, function(match, capture) {
          return (+capture + 1) + '.0';
        });
        break;
      case 'major':
        version = currentVersion.replace(/^(\d+)\.\d+\.\d+/, function(match, capture) {
          return (+capture + 1) + '.0.0';
        });
        break;
      default:
        break;
    }

    if(!/\d+\.\d+\.\d+/.test(version)) {
      grunt.fail.fatal('\n\nYou need to specify a valid version number!\n\nThe current version is: ' + colors.yellow.bold(currentVersion) + '\n');
    }

    console.log('\nOK! Moving the needle from ' + colors.cyan.bold(currentVersion) + ' to ' + colors.cyan.bold(version) + '.');

    grunt.file.expand([
      'bower.json',
      'package.json'
    ]).forEach(function(f) {
      var json = grunt.file.readJSON(f);
      json.version = version;
      grunt.file.write(f, JSON.stringify(json, null, 2));
    });

    grunt.file.expand([
      'Gruntfile.js',
      'hippo.js',
      './tasks/**/*.js',
      './lib/*.js'
    ]).forEach(function(f) {
      var lines = grunt.file.read(f).split('\n');
      var newLines = [];
      for(var i=0, len=lines.length, line; i<len; i++) {
        line = lines[i];
        if(line.indexOf(' * Version: ')===0) {
          newLines.push(' * Version:    ' + version);
        }
        else if(line.indexOf(' * Date: ')===0) {
          newLines.push(' * Date:       ' + grunt.template.today('yyyy-mm-dd'));
        }
        else if(line.indexOf('    VERSION: \'')===0) {
          newLines.push('    VERSION: \'' + version + '\',');
        }
        else {
          newLines.push(line);
        }
      }
      grunt.file.write(f, newLines.join('\n'));
    });

    var readMe = grunt.file.read('README.md');
    grunt.file.write('README.md', readMe.replace(/(# Hippo v).*/, '$1' + version));

  });

};
