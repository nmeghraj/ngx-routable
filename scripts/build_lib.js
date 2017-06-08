const fs = require('fs-extra');
const uglify = require('uglify-js');
const zlib = require('zlib');
const spawn = require('child_process').execSync;
const webpack = require('webpack');
const jsonfile = require('jsonfile');
const path = require('path');
const voca = require('voca');

const ROOT = path.resolve(__dirname, '..');
function root(args) {
  args = Array.prototype.slice.call(arguments, 0);
  return path.join.apply(path, [ROOT].concat(args));
}

function titleCamelCase(value) {
  return value[0].toUpperCase() + voca.camelCase(value).substr(1);
}

function getExternals(packageJson) {
  const deps = Object.assign({}, packageJson.dependencies || {}, packageJson.peerDependencies || {});
  return [packageJson.name, ...Object.keys(deps)]
    .reduce( (arr, name) => {
      arr.push(new RegExp('^' + name.replace(`\\`, '\/')));
      return arr;
    }, []);
}

function resolveConfig(config, ...args) {
  if(typeof config === 'string') {
    return resolveConfig(require(config), ...args);
  } else if (typeof config === 'function') {
    return config(...args);
  } else if (config.__esModule === true && !!config.default) {
    return resolveConfig(config.default, ...args);
  } else {
    return config;
  }
}

function runWebpack(config, ...args) {
  const compiler = webpack(resolveConfig(config, ...args));
  return {
    compiler,
    done: new Promise( (RSV, RJT) => compiler.run((err, stats) => err ? RJT(err) : RSV(stats)) )
  }
}

function minifyAndGzip(destDir, umd) {
  const unminified = fs.readFileSync(path.join(destDir, 'bundle', `${umd}.umd.js`)).toString();
  const minified = uglify.minify(unminified);
  const gzipBuffer = zlib.gzipSync(Buffer.from(minified.code));

  fs.writeFileSync(path.join(destDir, 'bundle', `${umd}.umd.min.js`), minified.code, 'utf-8');
  const zipStream = fs.createWriteStream(path.join(destDir, 'bundle', `${umd}.umd.js.gz`));
  zipStream.write(gzipBuffer);
  zipStream.end();

  const pct = num => 100 * Math.round(10000 * (1-num)) / 10000;

  console.log(`
          --------------------------------------
          UMD Bundle info: ${umd}
          --------------------------------------
          unminified: \t${unminified.length / 1000} KB
          minified: \t${minified.code.length / 1000} KB \t(${pct(minified.code.length / unminified.length)} %)
          gzipped: \t${gzipBuffer.length / 1000} KB \t(${pct(gzipBuffer.length / unminified.length)}) %, ${pct(gzipBuffer.length / minified.code.length)} %)
          --------------------------------------
        `);
}

function runMeta() {

  const dirName = 'ngx-routable';
  const packageSrcPath = path.join(root('src', dirName, 'src'));
  const pkgJson = jsonfile.readFileSync(root('src', dirName, 'package.json'));
  const externals = getExternals(pkgJson);

  const meta = {
    name: titleCamelCase(dirName),
    dir: dirName,
    umd: dirName,
    externals: [/^\@angular\//].concat(externals)
  };

  // externals.length === 1 , own name is always added
  const isFlatStructure = !fs.readdirSync(packageSrcPath)
      .some( fsItem => fs.statSync(path.join(packageSrcPath, fsItem)).isDirectory() );


  function tsConfigUpdate(config) {
    if (!config.compilerOptions.outDir.endsWith('/')) {
      config.compilerOptions.outDir +=  '/'
    }
    config.compilerOptions.outDir += `.tmp`;

    if (isFlatStructure) {
      config.compilerOptions.outDir += `/${dirName}`;
    }

    // TODO: check why this go outside of folder
    config.include = [`./src/${dirName}/src/**/*.ts`];

    config.compilerOptions.baseUrl = "./src";
    config.compilerOptions.paths = {
     [dirName]: [`${dirName}/src/index.ts`],
     [`${dirName}/*`]: [`${dirName}/src/*`]
    };

    return config;
  }

  console.log(`Compiling ${meta.dir}\n`);

  const tsConfig = tsConfigUpdate(jsonfile.readFileSync(root(`tsconfig.package.json`)));
  jsonfile.writeFileSync(root('.tsconfig.tmp.json'), tsConfig, {spaces: 2});
  Object.assign(meta, {tsConfig: './.tsconfig.tmp.json'});

  const config = resolveConfig(root('config/webpack.package.js'), meta);

  return runWebpack(config)
    .done
    .then( () => {
      let p = root(tsConfig.compilerOptions.outDir);
      if (!p.endsWith(`/${meta.dir}`)) {
        p = path.join(p, meta.dir);
      }

      let from = path.join(p, 'src');
      let to = path.resolve(p, '..', '..', meta.dir);
      if (!fs.existsSync(from)) {
        from = p;
      }

      spawn(`mv ${from}/* ${to}`);
      spawn(`rm -rf ${path.resolve(p, '..')}`);

      minifyAndGzip(to, meta.umd);

    });
}

runMeta()
  .catch( err => {
    console.error(err);
    process.exit(1);
  });


