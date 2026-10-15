import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('express');

export const Router = express.Router;
export const json = express.json;
export const urlencoded = express.urlencoded;
export const static_ = express.static;

export default express;
