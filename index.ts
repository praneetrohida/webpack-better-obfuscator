"use strict";

import { Compiler, compilation } from "webpack";
import JavaScriptObfuscator from "javascript-obfuscator";
import { RawSource, SourceMapSource } from "webpack-sources";
import multimatch from "multimatch";
import { RawSourceMap } from "source-map";
import { TInputOptions as JavascriptObfuscatorOptions } from "javascript-obfuscator/src/types/options/TInputOptions";
const transferSourceMap = require("multi-stage-sourcemap").transfer;

class WebpackObfuscator {
  public excludes: string[] = [];

  constructor(
    public options: JavascriptObfuscatorOptions = {},
    excludes?: string | string[]
  ) {
    this.excludes = this.excludes.concat(excludes || []);
  }

  public apply(compiler: Compiler): void {
    const isDevServer = process.argv.find(v =>
      v.includes("webpack-dev-server")
    );
    if (isDevServer) {
      console.info(
        "JavascriptObfuscator is disabled on webpack-dev-server as the reloading scripts ",
        "and the obfuscator can interfere with each other and break the build"
      );
      return;
    }

    const pluginName = this.constructor.name;

    compiler.hooks.compilation.tap(pluginName, compilation => {
      compilation.hooks.afterOptimizeChunkAssets.tap(pluginName, chunks => {
        Array.from(chunks)
          .reduce((acc, chunk) => acc.concat((chunk.files as any) || []), [])
          .concat((compilation.additionalChunkAssets as any) || [])
          .slice(1)
          .forEach((file: string) => {
            if (
              !file.toLowerCase().endsWith(".js") ||
              this.shouldExclude(file)
            ) {
              return;
            }
            const asset = compilation.assets[file];

            const {
              inputSource,
              inputSourceMap
            } = this.extractSourceAndSourceMap(asset);
            const { obfuscatedSource, obfuscationSourceMap } = this.obfuscate(
              inputSource
            );
            if (this.options.sourceMap && inputSourceMap) {
              const transferredSourceMap = transferSourceMap({
                fromSourceMap: obfuscationSourceMap,
                toSourceMap: inputSourceMap
              });
              compilation.assets[file] = new SourceMapSource(
                obfuscatedSource,
                file,
                transferredSourceMap,
                inputSource,
                inputSourceMap
              );
            } else {
              compilation.assets[file] = new RawSource(obfuscatedSource);
            }
          });
      });
    });
  }

  private shouldExclude(filePath: string): boolean {
    return multimatch(filePath, this.excludes).length > 0;
  }

  private extractSourceAndSourceMap(
    asset: any
  ): { inputSource: string; inputSourceMap: RawSourceMap } {
    if (asset.sourceAndMap) {
      const { source, map } = asset.sourceAndMap();
      return { inputSource: source, inputSourceMap: map };
    } else {
      return {
        inputSource: asset.source(),
        inputSourceMap: asset.map()
      };
    }
  }

  private obfuscate(
    javascript: string
  ): { obfuscatedSource: string; obfuscationSourceMap: string } {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(
      javascript,
      this.options
    );

    return {
      obfuscatedSource: obfuscationResult.getObfuscatedCode(),
      obfuscationSourceMap: obfuscationResult.getSourceMap()
    };
  }
}

export = WebpackObfuscator;
