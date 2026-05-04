'use strict';

require('dotenv').config();

const config = {
    port: process.env.PORT || 5000,
    authToken: process.env.AUTH_TOKEN || '',
    testServerBase: 'http://20.207.122.201/evaluation-service'
};

module.exports = config;
