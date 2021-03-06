const path = require('path');
const helpers = require('./helpers');
const webpack = require('webpack');


/**
 * Webpack Plugins
 */
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TsConfigPathsPlugin = require('awesome-typescript-loader').TsConfigPathsPlugin;
const BannerPlugin = webpack.BannerPlugin;
const NgcWebpackPlugin = require('ngc-webpack').NgcWebpackPlugin;

import { PackageMetadata, FS_REF } from '../scripts/util';

module.exports = function(metadata: PackageMetadata) {
  const banner = `/** 
 * ${metadata.name} Copyright ${new Date().getFullYear()}
 * Licensed under MIT
 */`;


  /*
      The entry point references a file that does not exists at the time of definition.
      This is the generated angular flat module file which will generate once the angular compiler does its thing.
      The angular compiler runs before webpack starts via NgcWebpackPlugin so we're safe to assume
      that the file will be there (unless an error has occurred)

      The original entry point should have been:

      [metadata.umd]: helpers.root(`src/${metadata.dir}/src/index.ts`)

      But this will result in an incorrect bundle since internal aot compiler exports (ɵ) will not bundle.
   */
  const entry = {
    [metadata.umd]: helpers.root(metadata.tsConfigObj.compilerOptions.outDir, metadata.tsConfigObj.angularCompilerOptions.flatModuleOutFile)
  };

  return {
    bail: true,
    devtool: 'source-map',

    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        [metadata.dir]: `${metadata.dir}/src`
      }
    },

    entry,

    output: {
      path: helpers.root('.'),
      publicPath: '/',
      filename: `${FS_REF.PKG_DIST}/${metadata.dir}/${FS_REF.BUNDLE_DIR}/[name].webpack.umd.js`,
      libraryTarget: 'umd',
      library: metadata.name
    },

    // require those dependencies but don't bundle them
    externals: metadata.externalsWebpack,

    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: `awesome-typescript-loader`,
              options: {
                configFileName: '.tsconfig.tmp.json',
                declaration: false
              }
            }
          ],
          exclude: [/\.e2e\.ts$/]
        }
      ]
    },

    plugins: [
      // new webpack.ProvidePlugin({
      //   '__assign': ['tslib', '__assign'],
      //   '__extends': ['tslib', '__extends'],
      // }),

      new TsConfigPathsPlugin(),

      // fix the warning in ./~/@angular/core/src/linker/system_js_ng_module_factory_loader.js
      new webpack.ContextReplacementPlugin(
        /angular(\\|\/)core(\\|\/)(esm(\\|\/)src|src)(\\|\/)linker/,
        helpers.root('./src')
      ),

      new NgcWebpackPlugin({
        tsConfig: metadata.tsConfig
      }),

      new BannerPlugin({
        banner: banner,
        raw: true,
        entryOnly: true
      }),

      new CopyWebpackPlugin([
        { from: 'README.md', to: helpers.root(`./${FS_REF.PKG_DIST}/${metadata.dir}`) },
      ])
    ]
  };
};
