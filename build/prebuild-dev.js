#!/usr/bin/env node
// Prepare the same package metadata and resources as the production app.
process.argv[2] = 'output';
require('./prebuild-prod');
