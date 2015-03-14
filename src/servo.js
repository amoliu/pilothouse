'use strict';
/*jshint bitwise: false*/

var mraa = require('mraa');
var async = require('async');
var nconf = require('nconf');
var _ = require('lodash');
var Boom = require('boom');

var pwmAddress = nconf.get('servo:address');
var pwmBus = nconf.get('servo:bus');
var PCA9685 = {
    MODE1: 0,
    PRESCALE: 0xFE
};

var freq = nconf.get('servo:freq');
var stepSize = 1000000 / (4096 * freq); // in uS


function setup(doneCallback) {
    var pwm = new mraa.I2c(pwmBus);
    pwm.address(pwmAddress);


    function delay(ms) {
        return function (callback) {
            setTimeout(callback, ms);
        };
    }

    async.waterfall([
        //delay(200),
        function setSleep(callback) { // SET MODE1
            pwm.writeReg(0x00, 0x10); // Set to sleep mode for update to prescale
            callback(null);
        },
        delay(20),
        function setMode2(callback) { // SET MODE2
            pwm.writeReg(0x01, 0x04);
            callback(null);
        },
        delay(20),
        function setPrescale(callback) {
            // The *0.89 is determined empirically. See https://github.com/adafruit/Adafruit-PWM-Servo-Driver-Library/issues/11
            var prescale = Math.round(25000000 / (4096 * freq * 0.89)) - 1;
            //console.log('Prescale: 0x' + prescale.toString(16));
            pwm.writeReg(PCA9685.PRESCALE, prescale);
            //console.log('readPrescale: 0x' + pwm.readReg(PCA9685.PRESCALE).toString(16));
            callback(null);
        },
        delay(20),
        function setWakeup(callback) {
            pwm.writeReg(PCA9685.MODE1, 0x20); // internal clock, no sleep
            callback(null);
        },
        delay(20),
        function clearAll(callback) {
            var buffer = new Buffer(5);
            buffer[0] = 0xFA; // Write all registers
            buffer[1] = 0x00;
            buffer[2] = 0x00;
            buffer[3] = 0x00;
            buffer[4] = 0x10;

            pwm.write(buffer);
            callback(null);
        }
    ], function (err) {
        doneCallback(err, pwm);
    });
}


module.exports.init = function (state, doneCallback) {

    var pwm;

    /**
     * @param {String} channel name
     * @param {Number} position 1000-2000
     * @param callback
     */
    function setPosition(channel, position, callback) {
        if (position > 2000 || position < 1000) {
            callback(Boom.badData('Position "' + position + '" out of range'));
            return;
        }
        if (!_.has(state.servo, channel)) {
            callback(Boom.badData('Channel "' + channel + '" not valid'));
            return;
        }

        var t = Math.round(position / stepSize);

        var buffer = new Buffer(5);
        buffer[0] = 0x06 + (nconf.get('servo:channels')[channel] * 4);
        buffer[1] = 0x00;
        buffer[2] = 0x00;
        buffer[3] = (t & 0xFF);
        buffer[4] = (t >> 8) & 0x0F;
        pwm.write(buffer);

        console.log(channel + ': ' + position);

        state.servo[channel] = position;

        callback(null);
    }

    setup(function (err, pwm_) {
        pwm = pwm_;
        doneCallback(err, {
            setPosition: setPosition
        });
    });
};