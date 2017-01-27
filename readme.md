 Server
===

Hathor is a wrapper over the top of Hapi.  The goal is to remove boilerplate code from Hapi projects and introduce an easy and (hopefully) seamless upgrade path between Hapi versions.

If you have built any project and then tried to stay up with the latest version of Hapi you know that many times there are frustrating and/or breaking changes between versions.  Some people (including myself) have approached this by creating boiler plate projects.  But then you have the pain of keeping all your code bases in sync with your boiler plate.  If there are major changes then you have to deal with merging the changes, correcting conflicts, pulling in new libraries, etc...

Hathor aims to solve all of this by abstracting the common things from projects into modules that provide a stable API.  This stable version is them mutated to fit the latest "needs" of Hapi without any developer changes necessary.  This is the goal, at least as much as possible.

Unless you want to deal with the pain and agony of broken code, bugs, etc... NEVER install a version of Hathor that begins with 0.  Instead install the version of Hathor that matches the version of Hapi you want to support.

Hathor is still in early development, no features will be removed but new features will be added.  As long as you stick to the basic usage outlined below, you shouldn't notice any changes.

As an example if you need Hapi 16 support, then use npm install --save hathor@16, for version 17 use npm install --save hathor@17

Install
---

```
npm install --save hathor@16
```

What's provided
---

Out of the box Hathor provides a static file server via inert, automatic route loading, and automatic plugin loading.  With a few configuration options and some npm installs Hathor can add authentication to your project.  Don't want authentication in your dev environment, simply don't configure it there.  Want a different configuration in different environments, then just configure each as you see fit.

### Static files

Currently static file serving is built into Hathor, eventually this will be broke out into its own plugin that will be included by default.  This will allow users to provide custom static page serving for things like; multiple source folders, server side rendering, rendering templated source files, etc...

### Configuration

Configurations are supplied through configuration providers build on top of Hathor-Config.  Currently available are:

  * hathor-config - Base configuration provider
  * hathor-file-config - Utilize configuration values from JavaScript configuration files
    * **Future:** Add support; json, yaml, etc?

Planned configuration loaders are:

  * hathor-cmd-config - Utilize command line arguments as configuration values
  * hathor-env-config - Utilize environment variables as configuration values
  * hathor-consul-config - Utilize the Consul key/value store to provide configuration values

### Authentication

Currently supported authentication plugins are:

  * hathor-basic-auth - Basic authentication
  * hathor-jwt-auth - Support for JWT authentication
  * hathor-cookie-auth - Support for Cookie based authentication

Basic Usage
---

Assumes a setup as follows:

```
npm install --save hathor hathor-file-config hathor-logger hathor-basic-auth
```

### index.js
```js
const {Server} = require('hathor');
const Config = require('hathor-config');
const FileConfig = require('hathor-config');
const logger = require('hathor-logger');

const config = new Config();
config.merge(new FileConfig('config/config'));
config.set('server.logger', logger);

const serverConfig = config.get('server', {});
const server = new Server(serverConfig);

server.start((err)=>{
  logger.error(err);
  process.exit(1);
});
```

### config/config.js

```js
const authModule = 'basic-auth';
//const authModule = 'cookie-auth';
//const authModule = 'jwt-auth';

const path = require('path');
// NOTE: This is here in case you want to use JWT or Cookie auth, etc
const key = (()=>{
  const logger = require('hathor-logger');
  const fs = require('fs');
  const keyFilename = path.resolve('./config/key.pem');
  try{
    logger.info('Loading key file from:', keyFilename);
    const key = fs.readFileSync(keyFilename).toString();
    logger.info('Key successfully loaded')
    return key;
  }catch(e){
    logger.error('Error loading key file:', e);
    logger.info('Generating new key file: ', keyFilename);
    const key = require('crypto').randomBytes(256).toString('base64');
    fs.writeFileSync(keyFilename, key);
    logger.info('Generated key file: ', keyFilename);
    return key;
  }
})();

module.exports = {
  server: {
    //static: true, // serve static content
    //webroot: 'ui/build', // Set the webroot for static content
    connection: { // Listen on localhost:9001
      port: 9001,
      host: 'localhost'
    },
    auth: { // Use auth
      //static: true, // secure static content
      key,
      module: authModule,
      ttl: 1000 * 60 * 3, // 3 minutes TTL
      whitelist: [ // Always allow access to the login folder
        'login'
      ],
      blacklist: [ // Never allow access to the login/private.html file
        'login/private.html'
      ],
      users: [ // Setup a test user
        {
          username: 'test',
          password: 'person' // This could also be a bcrypt hash
        }
      ]
    }
  }
};
```

API
===

Server(options)
---

### Options

```js
{
  static: Boolean, // default true
  webroot: String, // defaults to 'ui/build'
  connection: {
    host: String, // default os.hostname
    port: Number, // default 9000
  },
  auth: {
    static: Boolean, // Place auth on static pages or not
    key: String, // Key, certificate, etc for auth modules that require it
    module: String, // Name or location of the auth module to use
    ttl: Number, // The TTL for the connection in ms, EX: for 1 year: 365 * 24 * 60 * 60 * 1000
    whitelist: [ // Whitelist of static assets to not place behind auth
      String
    ],
    blacklist: [ // Blacklist of static assets to always place behind auth
      String
    ],
    users: [ // Array of users for development
      {
        username: String,
        password: String
      }
    ],
    findUser(username, password, callback){ // function to lookup users, returns callback(err, isValid, session)
    },
    plugin: { // configuration overrides for the underlying Hapi auth plugin
    }
  }
}
```
