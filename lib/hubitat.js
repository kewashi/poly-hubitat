'use strict';

const request = require('request-promise-native');
// const request = require('request');
const utils = require('./utils.js');

const ignoredAttributes = [
    'sensor', 'actuator', 'DeviceWatch-DeviceStatus', 'DeviceWatch-Enroll', 'checkInterval', 'healthStatus', 'devTypeVer', 'dayPowerAvg', 'apiStatus', 
    'yearCost', 'yearUsage','monthUsage', 'monthEst', 'weekCost', 'todayUsage', 'groupPrimaryDeviceId', 'groupId', 'presets',
    'maxCodeLength', 'maxCodes', 'readingUpdated', 'maxEnergyReading', 'monthCost', 'maxPowerReading', 'minPowerReading', 'monthCost', 'weekUsage', 'minEnergyReading',
    'codeReport', 'scanCodes', 'verticalAccuracy', 'horizontalAccuracyMetric', 'distanceMetric', 'closestPlaceDistanceMetric',
    'closestPlaceDistance', 'codeChanged', 'codeLength', 'lockCodes', 'horizontalAccuracy',
    'verticalAccuracyMetric', 'indicatorStatus', 'todayCost', 'previousPlace','closestPlace', 'minCodeLength',
    'arrivingAtPlace', 'lastUpdatedDt', 'custom.disabledComponents',
    'disabledCapabilities','enabledCapabilities','supportedCapabilities',
    'supportedPlaybackCommands','supportedTrackControlCommands','supportedButtonValues','supportedThermostatModes','supportedThermostatFanModes',
    'dmv','di','pi','mnml','mnmn','mnpv','mnsl','icv','washerSpinLevel','mnmo','mnos','mnhw','mnfv','supportedCourses','washerCycle','cycle'
];

// Polyglot is the Polyglot or PGC module
// polyInterface is the instantiated Polyglot interface module
module.exports = function(Polyglot, polyInterface) {
    const logger = Polyglot.logger;

class HubitatInterface {

    constructor(polyInterface) {
      this.polyInterface = polyInterface;

      const config = this.polyInterface.getConfig();
      this.hubHost = config.hubHost;
      this.hubEndpt = config.endpt;
      this.accessToken = config.accessToken;
      this.hubName = "";
      this.hubId = "";

    }

    getDevices() {
        var params = {"access_token": this.accessToken};
        var header = {
            "Content-Type": "application/json"
        };
        const that = this;
        var namehost = this.hubEndpt + "/gethubinfo";
        return utils.curl_call(namehost, header, params, false, "POST", true)
        .then(jsonbody => {
            that.hubName = jsonbody["sitename"];
            that.hubId = jsonbody["hubId"];
            that.polyInterface.addCustomData({hubName: that.hubName})
            that.polyInterface.addCustomData({hubId: that.hubId})
            return that.getDevices();
        })
        .then( () => {
            return utils.curl_call(that.hubEndpt + "/getallthings", header, params, false, "POST", true)
        })
        .then(jsonbody => {
            return this.hubInfoCallback(jsonbody);
        })    
        .catch(err => {
            logger.error(err);
            return null;
        });
    }

    // performs switch actions - emulating how HousePanel does it
    doAction(device, subid, value) {
        var params = {"access_token": this.accessToken};
        var attr = device.devicetype + " p_1 " + device.pvalue.switch;
        var header = {
            "Content-Type": "application/json",
            swid: device.deviceid, swattr: attr, swvalue: value, swtype: device.devicetype, subid: subid
        };
        return utils.curl_call(this.hubEndpt + "/doaction", header, params, false, "POST", true);
    }


    // callback for loading Hubitat devices
    hubInfoCallback(jsonbody) {
        var mydevices = {};
        const that = this;

        if ( !jsonbody || ! utils.is_array(jsonbody)) {
            return mydevices;
        }

        // now add them one at a time until we have them all
        jsonbody.forEach(function(content) {
            var thetype = content["type"];
            var deviceid = content["id"];
            var origname = content["name"] || "unknown";
            var pvalue = content["value"];
            
            // if a name isn't there use master name
            if ( !pvalue.name ) {
                pvalue.name = origname;
            }
            pvalue.devicetype = thetype;
            
            // deal with presence tiles
            // if ( pvalue["presence"]==="not present" || pvalue["presence"]==="not_present" ) {
            //     pvalue["presence"] = "absent";
            // }

            // remove ignored items from pvalue
            for (var field in pvalue) {
                if ( ignoredAttributes.includes(field) ) {
                    delete pvalue[field];
                }
            }

            // handle audio and weather tiles
            if ( thetype==="audio" || pvalue.audioTrackData ) {
                pvalue = that.translateAudio(pvalue);
            } else if ( thetype==="music" || pvalue.trackData ) {
                pvalue = translateMusic(pvalue);
            } else if ( thetype==="weather" ) {
                pvalue = that.translateWeather(pvalue);
            } else {
                pvalue = that.translateObjects(pvalue);
            }
            // original housepanel included fields we don't need and we can keep the object instact
            // var pvalstr = encodeURI2(pvalue);
            // var device = {userid: userid, hubid: hubindex, deviceid: deviceid, name: origname, 
            //     devicetype: thetype, hint: hint, pvalue: pvalstr};
            var device = {hubid: that.hubId, deviceid: deviceid, name: origname, 
                          devicetype: thetype, pvalue: pvalue};
            mydevices[deviceid] = device;
        });
        return mydevices;
    }

    translateAudio(pvalue, specialkey, audiomap) {
        // map of audio fields used in multiple places
        // but if false is given then we just translate pvalue
        if ( typeof specialkey === "undefined" || !specialkey ) {
            specialkey = "audioTrackData";
        }
    
        if ( typeof audiomap !== "object" ) {
            audiomap = {"title": "trackDescription", "artist": "currentArtist", "album": "currentAlbum",
                        "albumArtUrl": "trackImage", "mediaSource": "mediaSource"};
        }
    
        try {
            var audiodata;
            if ( pvalue ) {
                if ( specialkey==="" || specialkey===false ) {
                    if ( typeof pvalue==="string" ) {
                        audiodata = JSON.parse(pvalue);
                        pvalue = {};
                    } else if ( typeof pvalue==="object" ) {
                        audiodata = utils.clone(pvalue);
                        pvalue = {};
                    } else {
                        throw "Unknown format in translateAudio";
                    }
                } else if ( utils.array_key_exists(specialkey, pvalue) && typeof pvalue[specialkey]==="string" ) {
                    audiodata = JSON.parse(pvalue[specialkey]);
                    // delete pvalue[specialkey];
                } else if ( utils.array_key_exists(specialkey, pvalue) && typeof pvalue[specialkey]==="object" ) {
                    audiodata = utils.clone(pvalue[specialkey]);
                    pvalue[specialkey] = JSON.stringify(pvalue[specialkey]);
                }
    
                for  (var jtkey in audiodata) {
                    if ( utils.array_key_exists(jtkey, audiomap) ) {
                        var atkey = audiomap[jtkey];
                        if ( atkey ) {
                            pvalue[atkey] = audiodata[jtkey] || "";
                        }
                    } else {
                        pvalue[jtkey] = audiodata[jtkey];
                    }
                }
    
                // get image from the string if http is buried
                // this usually works for music tiles but not always
                // not needed for audio tiles since http will be first
                if ( utils.array_key_exists("trackImage", pvalue) ) {
                    var jtval = pvalue["trackImage"];
                    if  ( typeof jtval==="string" && jtval.indexOf("http")>0 ) {
                        var j1 = jtval.indexOf(">http") + 1;
                        var j2 = jtval.indexOf("<", j1+1);
                        if ( j1===-1 || j2===-1) {
                            jtval = "";
                        } else {
                            jtval = jtval.substring(j1, j2);
                            jtval = jtval.replace(/\\/g,"");
                        }
                        pvalue["trackImage"] = jtval;
                    }
                }
            }
        } catch(jerr) {
            console.log( (ddbg()), jerr);
        }
        return pvalue;
    }
    
    translateMusic(pvalue) {
        const audiomap = {"name": "trackDescription", "artist": "currentArtist", "album": "currentAlbum",
                        "status": "status", "trackMetaData": "trackImage", "trackImage":"trackImage", "metaData":"",
                        "trackNumber":"", "music":"", "trackUri":"", "uri":"", "transportUri":"", "enqueuedUri":"",
                        "audioSource": "mediaSource", "trackData": "trackData"};
        const musicmap = {"artist": "currentArtist", "album": "currentAlbum",
                        "status": "status", "trackMetaData": "", "metaData":"",
                        "trackNumber":"trackNumber", "music":"", "trackUri":"", "uri":"", "transportUri":"", "enqueuedUri":"",
                        "audioSource": "mediaSource"};
    
        var nvalue = {};
        for  (var jtkey in pvalue) {
            if ( utils.array_key_exists(jtkey, musicmap) ) {
                var atkey = musicmap[jtkey];
                if ( atkey ) {
                    nvalue[atkey] = pvalue[jtkey] || "";
                }
            } else {
                nvalue[jtkey] = pvalue[jtkey];
            }
        }
    
        // if there is a trackData field then use that to overwrite stuff
        if ( utils.array_key_exists("trackData", nvalue) ) {
            nvalue = this.translateAudio(nvalue, "trackData", audiomap);
        }
        return nvalue;
    }
    
    // recursively expand objects
    translateObjects(pvalue) {
        var nvalue = pvalue;
        for  (var tkey in pvalue) {
            var tval = pvalue[tkey];
            if ( typeof tval==="object" ) {
                for (var jtkey in tval ) {
                    var jtval = tval[jtkey];
                    var newkey = tkey + "_" + jtkey.toString();
                    if ( typeof jtval!=="object" ) {
                        nvalue[newkey] = jtval.toString();
                        // console.log(">>>> nvalue str: ", nvalue);
                    }
                }
                delete nvalue[tkey];
            }
        }
        return nvalue;
    }
    
    translateWeather(pvalue) {

        if ( !pvalue || typeof pvalue!=="object" ) {
            return pvalue;
        }
    
        if ( !pvalue.realFeel ) {
            if ( pvalue && pvalue.weatherIcon && pvalue.forecastIcon ) {
                var wicon = getWeatherIcon(pvalue["weatherIcon"]);
                if ( wicon===false ) {
                    delete pvalue["weatherIcon"];
                } else {
                    pvalue["weatherIcon"] = wicon;
                }
                var ficon = getWeatherIcon(pvalue["forecastIcon"]);
                if ( ficon===false ) {
                    delete pvalue["forecastIcon"];
                } else {
                    pvalue["forecastIcon"] = ficon;
                }
            }
            return pvalue;
        }
    
        // the rest of this function fixes up the accuWeather tile
        var newvalue = {};
        newvalue.name = pvalue.name || "Weather";
        newvalue.temperature = pvalue.temperature;
        newvalue.realFeel = pvalue.realFeel;
        newvalue.weatherIcon = getWeatherIcon(pvalue.weatherIcon, true);
        if ( newvalue.weatherIcon===false ) {
            delete newvalue.weatherIcon;
        }
    
        // fix the summary string to work with the web
        var summaryStr = pvalue.summary;
        var forecastStr = "";
        if ( typeof summaryStr === "string" ) {
            newvalue.summary = summaryStr.replace(/\n/g, "<br/>");
        }
    
        // make the visual forcast block
        try {
            var forecast = JSON.parse(pvalue.forecast);
        } catch(e) {
            if ( typeof pvalue.forecast === "string" ) {
                forecastStr = pvalue.forecast.replace(/\n/g, "<br/>");
            }
            forecast = null;
        }
        if ( forecast ) {
            forecastStr = "<table class='accuweather'>";
            forecastStr += "<tr>";
            forecastStr += "<th class='hr'>Time</th>";
            forecastStr += "<th class='temperature'>Temp</th>";
            // forecastStr += "<th class='realFeel'>Feels</th>";
            forecastStr += "<th class='precipitation'>Icon</th>";
            forecastStr += "</tr>";
    
            var hr = 1;
            var thishr = hr.toString().trim()+"hr"
            while ( hr <= 3 && typeof forecast[thishr] === "object" ) {
                forecastStr += "<tr>";
                // see if we have icons and times
                if (pvalue["time"+thishr]) {
                    var words = pvalue["time"+thishr].split("\n");
                    var timestr = words[1].substr(0,3) + " " + words[2];
                    forecastStr += "<td class='hr'>" + timestr + "</td>";
                } else {
                    forecastStr += "<td class='hr'>" + hr + " Hr</td>";
                }
                forecastStr += "<td class='temperature'>" + forecast[thishr].temperature + "</td>";
                // forecastStr += "<td class='realFeel'>" + forecast[thishr].realFeel + "</td>";
                if (pvalue["icon"+thishr]) {
                    forecastStr += "<td class='weatherIcon'>" + getWeatherIcon(pvalue["icon"+thishr], true) + "</td>";
                } else {
                    forecastStr += "<td class='weatherIcon'>" + getWeatherIcon("na") + "</td>";
                }
                forecastStr += "</tr>";
    
                hr++;
                thishr = hr.toString()+"hr";
            }
            forecastStr += "</table>";
        }
        newvalue.forecast = forecastStr;
        return newvalue;
    }
    
}

  // Module returns a singleton
  return new HubitatInterface(polyInterface); 
};
