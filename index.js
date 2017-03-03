const path = require('path');
const glob = require('glob');
const async = require('async');
const {
  noop,
  exclude,
  underscoreKeys,
  getObjectValue
} = require('hathor-utils');
const Hapi = require('hapi');
const Config = require('hathor-config');

class Server{
  constructor(options = {}){
    const cfg = options.toJS();
    this.config = options;
    this.useAuth = !!cfg.auth;
    this.auth = cfg.auth;
    this.plugins = cfg.plugins || [];
    this.routes = cfg.routes || [];
    this.webRoot = path.join(process.cwd(), cfg.webRoot || cfg.webroot || 'ui/build');
    this.routesPath = path.join(process.cwd(), cfg.routesPath || 'routes');
    this.pluginRoutes = [];
    this.connection = Object.assign({port: 9000}, cfg.connection);
    this.logger = cfg.logger || require('hathor-logger');
  }

  appendAuth(routes, callback = noop){
    if(!this.useAuth){
      return routes.map((route)=>{
        return exclude(route, 'auth');
      });
    }
    const mappedRoutes = routes.map((route)=>{
      if(!route.auth){
        return exclude(route, 'auth');
      }
      if(route.config){
        return Object.assign({}, exclude(route, 'auth'), {
          config: Object.assign({}, route.config, {
            auth: this.auth.type
          })
        });
      }
      const base = exclude(route, 'handler', 'auth');
      return Object.assign({}, base, {
        config: {
          auth: this.auth.type,
          handler: route.handler
        }
      });
    });
    callback(null, mappedRoutes);
    return mappedRoutes;
  }

  registerRoutes(routes = [], callback = noop){
    if(typeof(routes)==='function'){
      callback = routes;
      routes = [];
    }
    const staticPages = this.config.get('static', true)===true?[
      {
        method: 'GET',
        path: '/{param*}',
        auth: !!(this.auth || {}).static,
        handler: {
          directory: {
            path: '.',
            redirectToSlash: true,
            index: true
          }
        }
      }
    ]:[];
    const appRoutes = (()=>{
      try{
        return require(path.join(this.routesPath, 'index.js'));
      }catch(e){
        const routeFiles = glob.sync(path.join(this.routesPath, '*/index.js'));
        return routeFiles.map((routeFile)=>{
          try{
            return require(routeFile);
          }catch(e){
            this.logger.error(`Error loading route:`, `${routeFile}`, e);
            return false;
          }
        }).filter((r)=>!!r);
      }
    })();

    const allRoutes = this.appendAuth([...staticPages, ...this.routes, ...routes, ...appRoutes, ...this.pluginRoutes]);
    allRoutes.forEach((route)=>{
      const isSecure = this.useAuth && !!getObjectValue(['config', 'auth'], route, false);
      this.logger.info(`Registering${isSecure?' authenticated':''} ${route.method}:`, `${route.path}`);
    });
    this.hapi.route(allRoutes);
    callback(null, allRoutes);
  }

  registerPlugins(plugins = [], callback = noop){
    const authModuleFilename = (this.auth||{}).module||false;
    const authModule = (()=>{
      if(!authModuleFilename){
        return false;
      }
      const cfg = require(authModuleFilename);
      const mod = (typeof(cfg)==='function')?cfg(this.hapi, this.config):cfg;
      if(mod.type){
        this.auth.type = this.auth.type || mod.type;
      }
      return mod;
    })();
    const basePlugins = authModule?[require('inert'), require('vision'), authModule]:[require('inert'), require('vision')];
    if(typeof(plugins)==='function'){
      callback = plugins;
      plugins = [];
    }
    const registerPlugin = (info, plugin)=>{
      info.plugins.push(plugin.plugin?Object.assign({register: (plugin.plugin && plugin.plugin.register?plugin.plugin.register:plugin.plugin)}, exclude(plugin, 'plugin', 'postRegister')):exclude(plugin, 'postRegister'));
      //info.plugins.push(exclude(plugin, 'postRegister'));
      if(plugin.postRegister){
        info.postRegistration.push(plugin.postRegister);
      }
      return info;
    };
    const pluginDetails = [...basePlugins, ...this.plugins, ...plugins].reduce((info, cfg)=>{
      const lib = (typeof(cfg)==='function')?cfg(this.hapi, this.config):cfg;
      if(lib.routes){
        const newRoutes = typeof(lib.routes)==='function'?lib.routes(this.hapi, this.config):lib.routes;
        info.routes = info.routes.concat(Array.isArray(newRoutes)?newRoutes:[newRoutes]);
      }
      if(lib.plugin){
        if(lib.postRegister){
          info.postRegistration.push(lib.postRegister);
        }
        return registerPlugin(info, lib.plugin);
      }
      if(lib.plugins){
        return lib.plugins.reduce((info, plugin)=>registerPlugin(info, plugin), info);
      }
      info.plugins.push(lib);
      return info;
    }, {plugins: [], routes: [], postRegistration: []});
    this.pluginRoutes = pluginDetails.routes.filter((r)=>!!r);
    return this.hapi.register(pluginDetails.plugins, (err)=>{
      if(err){
        this.logger.error(err);
        return callback(err);
      }
      async.eachSeries(pluginDetails.postRegistration, (postCall, next)=>{
        postCall(this.hapi, this.config, next);
      }, ()=>callback());
    });
  }

  init(callback = noop){
    this.hapi = new Hapi.Server({
      connections: {
        routes: {
          files: {
            relativeTo: this.webRoot
          }
        }
      }
    });
    this.hapi.logger = this.logger;
    this.hapi.connection(this.connection);

    this.registerPlugins(()=>{
      this.registerRoutes(callback);
    });
  }

  start(callback = noop){
    if(!this.hapi){
      return this.init(()=>this.start(callback));
    }
    this.hapi.start((err)=>{
      if(err){
        if(callback){
          return callback(err);
        }
        throw err;
      }
      this.logger.info(`Serving static content from:`, `${this.webRoot}`);
      this.logger.info(`Server running at:`, `${this.hapi.info.uri}`);
      return callback(null, this);
    });
  }
};

module.exports = {Server};
