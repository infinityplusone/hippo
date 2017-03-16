/*
 * Provides find-tables to generate Grunt Task
 *
 * Author(s):  Jonathan "Yoni" Knoll
 * Version:    0.20.2
 * Date:       2017-03-16
 *
 */

module.exports = function(grunt) {
  'use strict';

  grunt.registerTask('find-tables', 'Searches for JSON files and creates a schema.json for Hippo to consume.', function() {

    var colors = require('colors');
    var _ = require('lodash');
            _.mixin(require("lodash-inflection"));
    var path = require('path');
    var fs = require('fs');

    var dest = 'hippo-schema.json';

    var schema = {};
    var tables = [];

    var excludePatterns = [
      './**/*.json',
      '!./{bower,package,hippo-schema,common/shapes}.json',
      '!./{node_modules,bower_components,scripts,tasks,test,tmp}/**'
    ];

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

    function processDataSource(f, src) {
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
          name: _.startCase(name),
          columns: getColumns(json),
          dependencies: [],
          source: typeof src==='string' ? src : grunt.config('pkg').name
        };
        tables.push(id);
      }
    } // processDataSource

    // find data files in specified locations
    if(grunt.config('hippo') && grunt.config('hippo').src.length>0) {
      grunt.file.expand(['**/hippo-data.json']).forEach(function(dataSrc) {
        excludePatterns.push('!./' + dataSrc);
        var json = grunt.file.readJSON(dataSrc);
        json.files.forEach(function(f) {
          if(grunt.file.exists(f)) {
            excludePatterns.push('!./' + f);
            processDataSource(f, json.source);
          }
        });
      });
    }

    // find data files within this project
    grunt.file.expand(excludePatterns).forEach(processDataSource);
   
    tables.forEach(function(t) {
      Object.keys(schema[t].columns).forEach(function(c) {
        if(schema[t].columns[c]==='array' && tables.indexOf(c)>=0) {
          schema[t].dependencies.push(c);
        }
        else if(_.endsWith(c, '_id') && tables.indexOf(c.replace(/_id$/, 's'))>=0) {
         schema[t].dependencies.push(_.pluralize(c.replace(/_id$/, '')));
        }
      });
    });

    grunt.file.write(dest, JSON.stringify(schema, null, 2));

    console.log('File ' + colors.cyan(dest) + ' created.');

  });
};