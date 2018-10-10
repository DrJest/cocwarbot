const fs = require('fs');
const path = require('path');

module.exports = function(localesDir) {
  const locales = {};
  let _defaultLocale;

  this.load = dir => {
    if( fs.existsSync(dir) ) {
      fs.readdirSync(dir).forEach( l => {
        let n = l.replace('.json', '');
        if(!_defaultLocale) _defaultLocale = n;
        locales[n] = require( path.join(dir, l) );
      } );
    }
  };

  this.l = locale => {
    if(!locale) {
      return Format.bind(locales[_defaultLocale]);
    }
    if( locales[locale] ) {
      return Format.bind(locales[locale]);
    }
    else if( Object.keys(locales).length ) {
      return Format.bind(locales[_defaultLocale]);
    }
    else return Format.bind({});
  }

  const Format = function(key, ...args) {
    let t = this[key];
    args.forEach( (arg, index) => {
      let re = new RegExp( `\\{${index}\\}`, 'g' );
      t = t.replace(re, arg);
    })
    return t || key;
  }

  Object.defineProperties(this, {
    default: {
      enumerable: true,
      configurable: true,
      get: () => {
        return _defaultLocale;
      },
      set: locale => {
        if( locales[locale] ) {
          _defaultLocale = locale;
        }
      }
    },
    locales: {
      enumerable: true,
      configurable: false,
      get: () => {
        return locales;
      }
    }
  });

  if( localesDir ) {
    this.load( localesDir );
  }
}