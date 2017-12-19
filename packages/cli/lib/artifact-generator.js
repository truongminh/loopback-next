// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: @loopback/cli
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
const BaseGenerator = require('./base-generator');
const utils = require('./utils');
const StatusConflicter = utils.StatusConflicter;
const semver = require('semver');

module.exports = class ArtifactGenerator extends BaseGenerator {
  // Note: arguments and options should be defined in the constructor.
  constructor(args, opts) {
    super(args, opts);
  }

  _setupGenerator() {
    this.argument('name', {
      type: String,
      required: false,
      description: 'Name for the ' + this.artifactInfo.type,
    });
    // argument validation
    if (this.args.length) {
      const validationMsg = utils.validateClassName(this.args[0]);
      if (typeof validationMsg === 'string') throw new Error(validationMsg);
    }
    this.artifactInfo.name = this.args[0];
    this.artifactInfo.defaultName = 'new';
    this.conflicter = new StatusConflicter(
      this.env.adapter,
      this.options.force,
    );
  }

  /**
   * Checks if current directory is a LoopBack project by checking for
   * keyword 'loopback' under 'keywords' attribute in package.json.
   * 'keywords' is an array
   */
  checkLoopBackProject() {
    if (this.shouldExit()) return false;
    if (semver.gte(this.config.get('lbVersion'), '4.0.0')) {
      const err = new Error('The command must be run in a LoopBack 4 project.');
      this.exit(err);
    }
  }

  promptArtifactName() {
    if (this.shouldExit()) return false;
    const prompts = [
      {
        type: 'input',
        name: 'name',
        // capitalization
        message: utils.toClassName(this.artifactInfo.type) + ' class name:',
        when: this.artifactInfo.name === undefined,
        validate: utils.validateClassName,
      },
    ];

    return this.prompt(prompts).then((props) => {
      Object.assign(this.artifactInfo, props);
    });
  }

  scaffold() {
    if (this.shouldExit()) return false;
    // Capitalize class name
    this.artifactInfo.name = utils.toClassName(this.artifactInfo.name);

    // Copy template files from ./templates
    // Renaming of the files should be done in the generator inheriting from this one
    this.fs.copyTpl(
      this.templatePath('**/*'),
      this.destinationPath(),
      this.artifactInfo,
      {},
      {globOptions: {dot: true}},
    );
  }
};
