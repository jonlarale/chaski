#!/usr/bin/env node
import 'dotenv/config.js'; // eslint-disable-line import/no-unassigned-import
import React from 'react';
import {render} from 'ink';
import App from './app.js';

render(<App />);
