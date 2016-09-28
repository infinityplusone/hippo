/*
 * Provides find-tables to generate Grunt Task
 *
 * Author(s):  Jonathan "Yoni" Knoll
 * Version:    0.5.0
 * Date:       2016-09-28
 *
 */

module.exports = function(grunt) {
  'use strict';

  grunt.registerTask('find-tables', 'Searches for JSON files and creates a schema.json for Hippo to consume.', function() {

    var colors = require('colors');
    var _ = require('lodash');
    var path = require('path');
    var fs = require('fs');

    var dest = 'hippo-schema.json';

    var schema = {};

    function getColumns(json) {
      var columns = {};
      var reDate = /(^\d{1,4}[\.|\\/|-]\d{1,2}[\.|\\/|-]\d{1,4})(\s*(?:0?[1-9]:[0-5]|1(?=[012])\d:[0-5])\d\s*[ap]m)?$/;

      json.forEach(function(row) {
        Object.keys(row).forEach(function(col) {
          if(typeof columns[col]==='undefined') {
            if(col==='id') {
              columns[col] = 'id';
            }
            else if(_.endsWith(col, '_id')) {
              columns[col] = 'id';
            }
            else {
              switch(typeof row[col]) {
                case 'object':
                  if(Array.isArray(row[col])) {
                    columns[col] = 'array';
                  }
                  else {
                    columns[col] = 'object';
                  }
                  break;
                case 'string':
                  if(row[col].length>150) {
                    columns[col] = 'text';
                  }
                  else if(reDate.test(row[col])) {
                    columns[col] = 'date';
                  }
                  else {
                    columns[col] = 'string';
                  }
                  break;
                default:
                  columns[col] = typeof row[col];
                  break;
              } // switch
            } // else
          } // if
        }); // keys forEach
      }); // json forEach

      return columns;

    } // getColumns

    grunt.file.expand([
      './**/*.json',
      '!./{bower,package,hippo-schema}.json',
      '!./{node_modules,bower_components,scripts,tasks,test,tmp}/**'
    ]).forEach(function(f) {
      var json = grunt.file.readJSON(f);
      var name = path.basename(f, '.json').replace('-', ' ');
      var id = _.snakeCase(name);
      if(!Array.isArray(json)) {
        console.log('File ' + colors.cyan(f) + ' is not a valid table (' + colors.yellow('not an array') + ').');
      }
      else {
        schema[id] = {
          id: id,
          last_modified: fs.statSync(f).mtime,
          uri: f,
          name: _.capitalize(name),
          columns: getColumns(json),
          source: grunt.config('pkg').name
        };
      }
    });

    grunt.file.write(dest, JSON.stringify(schema, null, 2));

    console.log('File ' + colors.cyan(dest) + ' created.');

  });
};