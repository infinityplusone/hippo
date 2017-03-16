/*
 * Name: hippo.js
 * Description: Library to load and query data easily
 * Dependencies: lodash, lodash-inflection, jquery, jquery-bindable, json2, text
 * 
 * Author(s):  infinityplusone
 * Version:    0.20.1
 * Date:       2017-03-16
 *
 * Notes: 
 *
 *
 */

define([
  'lodash',
  'lodash-inflection',
  'emitter',
  'json2/cycle',
  'lz-string',
  'text'
], function(_) {

  _.mixin(require('lodash-inflection'));

  window.__processed = {}; // used to ensure that cloned rows get reused instead of re-cloned

  var ABBREVIATIONS = {
    k: '000',
    m: '000000',
    b: '000000000',
    t: '000000000000'
  };


  // Custom Errors
  function HippoError(message, data) {
    this.name = 'HippoError';
    this.message = message || '';
  }
  HippoError.prototype = Error.prototype;


  function LookupError(message, data) {
    this.name = 'LookupError';
    this.message = message || '';
  }
  LookupError.prototype = HippoError.prototype;


  function InsertError(message, data) {
    this.name = 'InsertError';
    this.message = message || '';
  }
  InsertError.prototype = HippoError.prototype;


  // this is used for outputting nice results in the console
  function Column(x, column) {
    this[column] = x;
  } // Column


  // helper function for formatting objects as tables in the developer console
  function _console(obj, column) {
    var consoleObj = {};

    Object.keys(obj).forEach(function(c) {
      consoleObj[c] = new Column(obj[c], column);
    });
    console.table(consoleObj);
  } // _console


  // _getColumnType
  // this should match whatever is used in the schema generator
  function _getColumnType(k, v) {

    var reDate = /(^\d{1,4}[\.|\\/|-]\d{1,2}[\.|\\/|-]\d{1,4})(\s*(?:0?[1-9]:[0-5]|1(?=[012])\d:[0-5])\d\s*[ap]m)?$/;

    if(k==='id') {
      return 'id';
    }
    else if(_.endsWith(k, '_id')) {
      return 'foreign-key';
    }
    else {
      switch(typeof v) {
        case 'object':
          if(Array.isArray(v)) {
            return 'array';
          }
          return 'object';
        case 'string':
          if(v.length>150) {
            return 'text';
          }
          else if(reDate.test(v)) {
            return 'date';
          }
          return 'string';
        default:
          return typeof v;
      } // switch
    }

  } // _getColumnType


  /**
   * Helper function to make dot-notation possible in fields
   * @param field {String} A string representing a row's key or dot-notated set of keys
   * @param subject {Object} The object in which we are searching for field 
   *
   * @return {*} The (deep) value 
   */
  function _getDeepValue(field, subject) {

    var f = field.split('.');

    while(f.length>0) {
      subject = subject[f.shift()];
      if(typeof subject==='undefined') {
        break;
      }
    }

    return subject;

  } // getDeepValue


  /**
   * Turn a value into something that lodash can use to search a table
   * @param pair {Array} An array containing a field and a value
   *
   * Notes: It is so incredibly unlikely that this is written well. I'm likely
   *        both missing cases and creating redundancies. We'll have to figure
   *        this out over time. // JSK
   *
   * @return {Object|Function} An acceptable lodash predicate
   */
  function _makePredicate(pair, options) {

    var predicate = {};
    var field = pair[0];
    var value = pair[1];
    var switchCase = null;

    switch(typeof value) {
      case 'string':
        if(/^[!><]=?[0-9.]+([kbm]?)$/.test(value)) {
          value = value.replace(/([kmbt])$/i, function(match) { return ABBREVIATIONS[match]; });
          switchCase = ['string1', field, value, typeof value];
          predicate = function(v) {
            return eval(_getDeepValue(field, v) + value); // evals are evil, so there is probably a safer way to do this
          };
        }
        else if(/^!/.test(value)) {
          switchCase = ['string2', field, value, typeof value];
          predicate = function(v) {
            return _getDeepValue(field, v) !== value.substr(1);
          };
        }
        else if(value!=='') {
          if(options.exactMatch) {
            switchCase = ['string3a', field, value, typeof value];
            predicate = function(v) {
              return new RegExp('^' + value + '$', 'i').test(_getDeepValue(field, v));
            };
          }
          else {
            switchCase = ['string3b', field, value, typeof value];
            predicate = function(v) {
              return new RegExp(value, 'gi').test(_getDeepValue(field, v));
            };
          }
        }
        else if(typeof field!=='undefined') {
          switchCase = ['string4', field, value, typeof value];
          predicate = field;
        }
        else {
          switchCase = ['string5', field, value, typeof value];
        }
        break;
      case 'function':
        switchCase = ['function', field, value, typeof value];
        predicate = value;
        break;
      case 'boolean':
      case 'object':
        if(Array.isArray(value)) {
          switchCase = ['array', field, value, typeof value];
          predicate = value.map(function(v) {
            return _makePredicate([field, v], options);
          });
        }
        else {
          if(value===true) {
            switchCase = ['object', field, value, typeof value];
            predicate = field;
          }
          else {
            switchCase = ['object', field, value, typeof value];
            predicate = value;
          }
        }
        break;
      case 'number':
        switchCase = ['number', field, value, typeof value];
        predicate[field] = value;
        break;
      default:
        switchCase = ['default', field, value, typeof value];
        break;
    }
    if(!!options.debug) {
      console.log(switchCase, predicate);
    }

    return [].concat(predicate);

  } // _makePredicate


  // Result object
  var Result = {

    create: function(rows, options) { // this is a mess and needs to be cleaned up
      this.rows = Array.prototype.slice.call(rows);
      var result = _.extend(Array.prototype.slice.call(this.rows), this, {
        first: this.rows.slice(0)[0] || false,
        last: this.rows.slice(-1)[0] || false,
        options: options,
        prototype: Result
      });
      return result;
    }, // create

    limit: function(count) {
      this.options.limit = count;
      return Result.create(this.rows.slice(0, count), this.options);
    }, // limit

    sortBy: function(criteria) {
      return Result.create(_.sortBy(this.rows, criteria), this.options);
    }, // sortBy

    toString: function() {
      return '[object HippoResult]';
    } // toString

  }; // Result


  // Hippo object
  var Hippo = Emitter({

    NAME: 'hippo',

    VERSION: '0.20.1',

    known: [],

    options: {
      compress: true,
      localSchema: 'hippo-schema.json',
      saveTables: false
    },

    ready: false,

    schema: {},

    tables: {},


    __addShortcuts: function() {

      // aliases for laziness
      Hippo.d = Hippo.describe;
      Hippo.f = Hippo.find;
      Hippo.i = Hippo.insert;
      Hippo.l = Hippo.list;
      Hippo.r = Hippo.remove;
      Hippo.s = Hippo.search;
      Hippo.u = Hippo.update;

    }, // __addShortcuts


    /**
     * Checks if a table needs to be loaded into Hippo
     * @param table {Object|String} A table or table id [required]
     */
    check: function(table) {

      var t =  typeof table==='string' ? t : table.id;

      if(typeof Hippo.schema[t]==='undefined' || (Hippo.schema[t].last_modified!==table.last_modified && (table.source!=='Hippo' || Hippo.schema[t].source===table.source))) {
        Hippo.schema[t] = table;
      }
      else {
        Hippo.schema[t].loaded = true;
      }

    }, // check


    /**
     * Ask Hippo to describe a table
     * @param table {String} The id of a table [required]
     * @param debug {Boolean} If true, the results are also output to the console
     *
     * @return {Object} The table's schema description
     */
    describe: function(table, debug) {

      var tableSchema = {};

      if(!table || typeof Hippo.schema[table]==='undefined') {
        throw new HippoError('Unknown table `' + table + '`!');
      }
      else {
        if(debug) {
          _console(Hippo.schema[table].columns, 'type');
        }
        return Hippo.schema[table].columns;
      }

    }, // describe


    /**
     * Drops a table from Hippo
     * @param table {String} The id of the table
     */
    drop: function(table) {

      console.log('Dropping:', table);

      delete(Hippo.schema[table]);
      delete(Hippo.tables[table]);

      // this will bring back Hippo tables
      Hippo.loadTables();

    }, // drop


    /**
     * Query a table for a single row of data
     * @param table {String} The id of a table [required]
     * @param lookup {Object|String|Number} The search criteria. If a number is provided, it will try to match a row's ID [required]
     *
     * @return {Object|Boolean} The result row or false
     */
    find: function(table, lookup) {

      if(!lookup) {
        throw new LookupError('Invalid lookup `' + lookup + '`!');
      }
      if(typeof lookup==='number') {
        lookup = { id: lookup };
      }
      return _.find(this.use(table), lookup) || false;

    }, // find


    /**
     * Get basic info about Hippo
     * @param debug {Boolean} If true, the results are also output to the console
     *
     * @return {Object} An object with information about Hippo
     */
    info: function(debug) {
      
      var stats = {
        VERSION: Hippo.VERSION,
        DATE: Hippo.DATE,
        TABLES: Object.keys(Hippo.tables)
      };

      if(debug) {
        _console(stats, 'value');
      }

      return stats;

    }, // info


    /**
     * Initialize Hippo by loading all available tables 
     * @param options {Object} [optional]
     *    - source {String} URI of a JSON schema [required]
     *    - saveTables {Boolean} Save tables to localStorage? [default=false]
     *    - compress {Boolean} Compress Hippo's data in localStorage? [default=true]
     *
     * @return Hippo
     */
    init: function(options) {

      if(Hippo.ready) {
        throw new HippoError('Hippo has already been loaded!');
      }

      Hippo.emit('hippo:starting');

      switch(typeof options) {
        case 'string':
          Hippo.prefix = options;
          break;
        case 'object':
          if(options.source) {
            Hippo.options.localSchema = options.source;
          }
          if(typeof options.saveTables!=='undefined') {
            Hippo.options.saveTables = options.saveTables;
          }
          if(typeof options.compress!=='undefined') {
            Hippo.options.compress = options.compress;
          }
          break;
        default:
          break;
      }

      // first, let's load what we've got in localStorage, if anything
      Hippo.loadFromLS();
      Hippo.loadTables();

      return Hippo;

    }, // init


    /**
     * Inserts a row into a local (browser) instance of Hippo
     * @param t {String} The id of the table [required]
     * @param row {Object} A row-like object that matches the table's schema [required]
     * @param autoIncrement {Boolean} If set to true, the row's id will automatically be set to the next integer available 
     * 
     * @return {Object} The new row in the table
     *
     * Note: `insert` only updates the tables in Hippo (and stored in localStorage).
     *       It does *not* update the raw rows of data loaded from source files
     */
    insert: function(t, row, autoIncrement) {

      row = _.extend({}, row); // prevent inheritance

      var table = Hippo.use(t, true);
      var schema = Hippo.schema[t];
      var columns = schema.columns;
      
      var columnType;

      if(autoIncrement || typeof row.id==='undefined') {
        row.id = _.max(_.map(table, 'id')) + 1;
      }
      else if(typeof row.id!=='undefined' && Hippo.find(t, row.id)) {
        throw new InsertError('There is already a row with the `id` ' + row.id + ' in table `' + t + '`!');
      }

      Object.keys(columns).forEach(function(c) {
        if(typeof row[c]!=='undefined') {
          ct = _getColumnType(c, row[c]);
          if(ct!==columns[c]) {
            throw new InsertError('Mismatched column type for `' + c + '`. Saw `' + ct + '`, expected `' + columns[c] + '`.');
          }
        }
      });
      row = Hippo.join(schema, row);
 
      Hippo.tables[t].push(row);
 
      Hippo.emit('hippo:table-row-added', table, row);
 
      return row;

    }, // insert


    /**
     * Joins a table row to data from another table
     * @param table {Table} The table containing the row [required]
     * @param row {Object} A row from the table
     *
     * @return {Object} The joined row
     */
    join: function(table, row) {

      var tableRow, keys;

      if(typeof __processed[table.id][row.id]!=='undefined') {
        tableRow = __processed[table.id][row.id];
      }
      else {
        tableRow = _.cloneDeep(row);
      }
      
      keys = Object.keys(tableRow);

      keys.forEach(function(k) {
        var key, otherTable;
        if(_.endsWith(k, '_id')) {
          key = k.slice(0, -3);
          otherTable = _.pluralize(key);
          tableRow[key] = Hippo.find(otherTable, {id: tableRow[k]});
          if(tableRow[key]) {
            table.columns[key] = 'object';
            table.columns[k] = 'foreign-key';
            if(typeof tableRow[key][table.id]==='undefined') {
              tableRow[key][table.id] = [];
            }
            tableRow[key][table.id].push(tableRow);
          }
        }
        else if(Array.isArray(tableRow[k]) && typeof Hippo.tables[k]!=='undefined') {
          tableRow[k].forEach(function(r, i) {
            tableRow[k][i] = Hippo.find(k, r);
          });
        }
      });

      __processed[table.id][tableRow.id] = tableRow;

      return tableRow;

    }, // join


    /**
     * List all tables currently available in Hippo
     * @param debug {Boolean} If true, the results are also output to the console
     *
     * @return {Object} An object containing the matching table names and their source
     */
    list: function(source, debug) {

      var tables = {};

      Object.keys(Hippo.schema).sort().forEach(function(t) {
        if(!source || source===Hippo.schema[t].source) {
          tables[t] = Hippo.schema[t].source;
        }
      });

      if(debug) {
        _console(tables, 'source');
      }

      return tables;

    }, // list


    /**
     * Load all new/modified tables from source files
     */
    loadFromFS: function() {

      var tables = Object.keys(Hippo.schema).filter(function(t) { return !Hippo.schema[t].skip && !Hippo.schema[t].loaded; }),
          tablesToLoad = tables.filter(function(t) { return typeof Hippo.schema[t].rows==='undefined'; });

      // any new tables to load?
      if(tablesToLoad.length>0) {

        // load all the tables at once and mount them
        requirejs(tablesToLoad.map(function(t) { return 'text!' + Hippo.schema[t].uri; }), function() {

          // First, we add each table's raw rows to its schema, so we don't have to load it again later
          Array.prototype.slice.call(arguments).forEach(function(table, i) {
            Hippo.schema[tables[i]].rows = JSON.parse(table);
          });

          // Next, we mount the rows onto core as a table. 
          tables.forEach(function(s) {
            Hippo.mount(Hippo.schema[s]);
          });

          // Now we're done, so we say so :)
          Hippo.emit('hippo:tables-loaded');
          
        });
      }
      else {
        if(tables.length>0) {
          tables.forEach(function(s) {
            Hippo.mount(Hippo.schema[s]);
          });
        }
        Hippo.emit('hippo:tables-loaded');
      }

      return Hippo;

    }, // loadFromFS


    /**
     * Load any/all data available from localStorage (or any object)
     * @param storage {Object} An object containing a Hippo-compliant schema and tables
     *
     */
    loadFromLS: function() {

      // Normally, tables will not be saved to localStorage. Thus, it makes sense to mount them after the schemas have been fully loaded
      var tablesToMount = [];

      Object.keys(localStorage).filter(function(key) { return _.startsWith(key, 'Hippo'); }).forEach(function(key) {
        var storage = JSON.retrocycle(JSON.parse(LZString.decompress(localStorage.getItem(key))));
        if(storage) {
          if(Hippo.VERSION!==storage.VERSION) {
            console.warn(Hippo.prefix + '\'s version of Hippo (' + Hippo.VERSION + ') does not match the version of Hippo in localStorage (' + storage.VERSION + ').\nUpdating localStorage.');
            localStorage.removeItem(key);
          }
          else {
            Hippo.DATE = storage.DATE;
            Object.keys(storage.schema).forEach(function(s) {
              Hippo.schema[s] = storage.schema[s];
              if(storage.tables && !!storage.tables[s]) {
                Hippo.tables[s] = Array.prototype.slice.call(storage.tables[s]);
              }
              else {
                tablesToMount.push(Hippo.schema[s]);
              }
            });
          }
        }
      });

      tablesToMount.forEach(Hippo.mount);

    }, // loadFromLS


    /**
     * Adds a new schema to Hippo
     * @param source {String} URI of a JSON schema
     *
     */
    loadSchema: function(source) {

      requirejs(['text!' + source], function(json) {
        var schema = JSON.parse(json);
        Hippo.emit('hippo:loading-schema', schema);
        Object.keys(schema).forEach(function(s) {
          Hippo.check(schema[s]);
        });
        Hippo.loadFromFS();
      });
      
    }, // loadSchema


    /**
     * Figures out which tables need to be loaded from files, and load them
     */
    loadTables: function() {

      // then load the local schema, if one is provided
      // tables in the local schema *will* override Hippo's built-in ones
      if(Hippo.options.localSchema) {
        Hippo.loadSchema(Hippo.options.localSchema);
      }
      else {
        Hippo.loadFromFS();
      }

    }, // loadTables


    /**
     * Mount a known table for use
     * @param schema {Object} A schema object containing rows of data
     *
     */
    mount: function(schema) {

      var s = schema.id;

      Hippo.known.push(s);
      
      if(typeof __processed[s]==='undefined') {
        __processed[s] = {};
      }

      if(Array.isArray(schema.dependencies)) {
        schema.dependencies.forEach(function(d) {
          if(Hippo.known.indexOf(d)<=0) {
            Hippo.mount(Hippo.schema[d]);
          }
        });
      }

      Hippo.tables[s] = _.create([]);
      Hippo.tables[s].type = 'HippoTable';

      if(!Array.isArray(schema.rows)) {
        throw new HippoError('Invalid rows for table `' + schema.name + '`!');
      }

      schema.rowCount = schema.rows.length;

      // wanna make sure there is an id column
      if(typeof schema.columns.id==='undefined') {
        schema.rows.forEach(function(r, i) {
          schema.rows[i].id = i + 1;
        });
        schema.columns.id = 'id';
      }

      schema.rows.forEach(function(r) {
        Hippo.tables[s].push(Hippo.join(schema, r));
      });

      Hippo.schema[s] = schema;

      Hippo.emit('hippo:table-ready', Hippo.schema[s]);

      return schema;

    }, // mount


    /**
     * Reload Hippo from available data
     */
    refresh: function() {

      Hippo.reset();

      Hippo.loadTables();

    }, // refresh


    /**
     * Removes rows from table frinto a local (browser) instance of Hippo
     * @param t {String} The id of the table [required]
     * @param lookup {Object} lookup to use for selecting rows to remove
     * 
     * @return {Object} The updated table
     *
     * Note: `remove` only updates the tables in Hippo (and stored in localStorage).
     *       It does *not* update the raw rows of data loaded from source files
     */
    remove: function(t, lookup) {

      var result = Hippo.search(t, lookup);
      var rows = _.remove(Hippo.tables[t], function(r) {
        return result.indexOf(r)>=0;
      });

      Hippo.emit('hippo:table-rows-removed', Hippo.tables[t], rows);

      return Hippo.tables[t];

    }, // remove


    /**
     * Removes all data from Hippo, including anything it has stored in localStorage
     */
    reset: function() {

      localStorage.removeItem('Hippo.' + Hippo.prefix);

      delete(Hippo.DATE);
      Hippo.schema = {};
      Hippo.tables = {};

    }, // reset


    /**
     * Revert a modified local table to its original state
     * @param t {String} The id of the table you'd like to revert [required]
     *
     * @return {Object} The reverted table
     */
    revert: function(t) {

      var table;

      delete(Hippo.tables[t]);

      Hippo.mount(Hippo.schema[t]);

      table = Hippo.tables[t];

      Hippo.emit('hippo:table-reverted', table);

      return table;

    }, // revert


    /**
     * Saves Hippo's schema & tables to localStorage for future use
     */
    save: function() {

      Hippo.DATE = new Date().toISOString();

      var sources = {}, source;

      // separate out the global & local tables so we don't save more than is necessary
      Object.keys(Hippo.schema).forEach(function(s) {
        source = Hippo.schema[s].source;
        if(typeof sources[source]==='undefined') {
          sources[source] = {
            VERSION: Hippo.VERSION,
            DATE: Hippo.DATE,
            schema: {},
            tables: Hippo.options.saveTables ? {} : false
          };
        }
        sources[source].schema[s] = _.cloneDeep(Hippo.schema[s]);
        if(Hippo.options.saveTables) {
          sources[source].tables[s] = Hippo.tables[s];
        }
        else {
          sources[source].schema[s].ready = false;
          sources[source].schema[s].loaded = false;
        }
        
      });

      Object.keys(sources).forEach(function(s) {
        if(Hippo.options.compress) {
          localStorage.setItem('Hippo.' + s, LZString.compress(JSON.stringify(JSON.decycle(sources[s]))));
        }
        else {
          localStorage.setItem('Hippo.' + s, JSON.stringify(JSON.decycle(sources[s])));
        }
      });

      Hippo.emit('hippo:saved');

    }, // save


    /**
     * Query a table for data
     * @param table {String} The id of a table [required]
     * @param lookup {Object|String} The search criteria [required]
     * @param callback {Function} Callback function which should return a properly formed result object
     * @param options {Object} Options for the search
     *
     * @return {Object} A result object containing:
     *    - count {Integer} The number of rows returned
     *    - options {Object} The options sent to the search request
     *    - rows {Array} The results
     */
    search: function(table, lookup, callback, options) {

      var reFunc = /^([A-Za-z_]+)\(([a-zA-Z0-9_\-]+)\)([<>=]+)([A-Za-z0-9_\-]+)$/i;
      var rows = this.use(table);
      var result = {};
      var predicate = lookup;
      var counts;

      if(callback && typeof callback==='object') {
        options = callback;
        callback = null;
      }

      options = _.extend({
        exactMatch: false,
        ignoreCase: true,
        first: false,
        sortBy: false
      }, options);

      switch(typeof lookup) {
        case 'function':
          rows = _.filter(rows, lookup);
          break;
        case 'string':
          if(/^[A-Za-z0-9_\-]+$/i.test(lookup)) { // simple string -> return rows that have that string as a key
            rows = _.filter(rows, lookup);
          }
          else if(/^![A-Za-z0-9_\-]+$/i.test(lookup)) { // inverse of simple string
            rows = _.reject(rows, lookup.substr(1));
          }
          else if(lookup!=='*') { // for more complex lookups
            predicate = reFunc.exec(lookup);
            if(predicate) {
              predicate = predicate.slice(1);
              switch(predicate[0]) {
                case 'count':
                  counts = _.countBy(rows, predicate[1]);
                  if(isNaN(Number(predicate[3]))) {
                    throw new LookupError('Invalid lookup `' + lookup + '`!');
                  }
                  rows = _.filter(rows, function(r) {
                    return eval(r[predicate[1]].length+predicate[2]+predicate[3]);
                  });
                  break;
                default:
                  throw new LookupError('Invalid lookup `' + lookup + '`!');
              } // switch
            } // if
            else {
              throw new LookupError('Invalid lookup `' + lookup + '`!');
            }
          }
          break;
        case 'object':
          if(!Array.isArray(lookup)) {
            lookup = _.toPairs(lookup);
          }
          lookup = lookup.map(function(pair) {
            if(!Array.isArray(pair)) {
              return _.toPairs(pair)[0]; // JSK: there has to be a better/safer way to do this
            }
            return pair;
          });
          lookup.forEach(function(pair) {
            _.flatten(_makePredicate(pair, options)).forEach(function(predicate) {
              rows = _.filter(rows, predicate);
            });
            
          });
          break;
        default: // case 'undefined': // in this case , we just return everything
          break;
      }

      result = Result.create(rows, options);

      if(callback) {
        return callback(result);
      }
      else {
        return result;
      }

    }, // search


    /**
     * Updates a row into a local (browser) instance of Hippo
     * @param t {String} The id of the table [required]
     * @param row {Object} A row-like object with a valid (existent) ID [required]
     * 
     * @return {Object} The updated row in the table
     *
     * Note: `update` only updates the tables in Hippo (and stored in localStorage).
     *       It does *not* update the raw rows of data loaded from source files
     */
    update: function(t, row) {

      var table = Hippo.use(t);
      var oldRow = Hippo.find(t, row.id);
      var idx;

      if(!oldRow) {
        throw new LookupError('Unable to find row with `id`: `' + row.id + '`!');
      }

      idx = _.findIndex(table, oldRow);
      
      row = _.merge(oldRow, row);

      Hippo.tables[t][idx] = row;

      Hippo.emit('hippo:table-row-modified', table, row);

      return row;

    }, // update


    /**
     * Use a table for a query. If the table hasn't been loaded, load it.
     * @param table {String} The id of a table [required]
     * @param strict {Boolean} If true, require that the table exists; otherwise, return false
     *
     * @return {Object|Boolean} The table to query or false
     */
    use: function(table, strict) {

      if(!table || typeof this.schema[table]==='undefined') {
        if(strict) {
          throw new LookupError('Invalid table `' + table + '`!');
        }
        else {
          return false;
        }
      }
      else {
        if(typeof this.tables[table]==='undefined') {
          // no more asynchronous loading (for now)
          throw new LookupError('Invalid table `' + table + '`!');
        }
        return this.tables[table];
      }

    } // use

  }); // Hippo

  // alias for emit so it plays nice with jQuery assumptions
  Hippo.trigger = Hippo.emit;


  /**
   * Used primarily as a cleanup mechanism for Hippo before telling the outside world everything is copacetic
   */
  function _onTablesLoaded() {

    if(!Hippo.ready) {
      Hippo.ready = true;
      Hippo.emit('hippo:ready');
    }
    else {
      Hippo.emit('hippo:reready');
    }

  } // _onTablesLoaded

  function _onRowModified(table, row) {
    Hippo.emit('hippo:table-modified', table, row);
    if(Hippo.options.saveTables) {
      Hippo.save();
    }
  } // _onRowModified


  // bind some events
  Hippo
    .on('hippo:table-ready', function(schema) {
      schema.ready = true;
      schema.loaded = true;
    })
    .on('hippo:table-row-added', _onRowModified)
    .on('hippo:table-reverted', _onRowModified)
    .on('hippo:table-row-modified', _onRowModified)
    .on('hippo:table-rows-removed', _onRowModified)
    .on('hippo:tables-loaded', _onTablesLoaded)
    .on('hippo:ready', Hippo.save)
    .on('hippo:reready', Hippo.save);

  return Hippo;

}); // define
