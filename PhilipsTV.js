const axios = require("axios");
const wol = require('wake_on_lan');
const pkg = require("./package.json");

class PhilipsTV {
    constructor(config) {
        this.config = config;
        this.wolURL = config.wol_url;
        this.model_year = config.model_year;
        this.model_year_nr = parseInt(this.model_year);

        // CHOOSING API VERSION BY MODEL/YEAR
        switch (this.model_year_nr) {
            case 2016:
                this.api_version = 6;
                break;
            case 2014:
                this.api_version = 5;
                break;
            default:
                this.api_version = 1;
            }
        // CONNECTION SETTINGS
        this.protocol = (this.api_version > 5) ? 'https' : 'http';
        this.portno = (this.api_version > 5) ? '1926' : '1925';
        this.apiUrl = `${this.protocol}://${config.ip_address}:${this.portno}/${this.api_version}/`;

        // Configure axios with default settings
        this.httpClient = axios.create({
            timeout: 5000, // Reduced from 10000 to 5000ms for faster response
            httpsAgent: this.api_version > 5 ? new (require('https').Agent)({
                rejectUnauthorized: false
            }) : undefined,
            auth: {
                username: this.config.username,
                password: this.config.password
            }
        });

    }


    async api(path, body = null) {
        try {
            const config = {
                method: body ? "POST" : "GET",
                url: this.apiUrl + path,
                data: body || undefined,
                headers: body ? { 'Content-Type': 'application/json' } : undefined
            };

            const response = await this.httpClient(config);
            return response.data || {};
        } catch (error) {
            if (error.response) {
                // Request made but server responded with error status
                return {};
            }
            throw error;
        }
    }

    async getSystemState() {
        try {
            const res = await this.api("system");
            return res
        } catch {
            return false;
        }
    }

    async getPowerState() {
        try {
            const res = await this.api("powerstate");
            return res.powerstate === "On";
        } catch {
            return false;
        }
    }

    async setPowerState(value) {
        if (value && this.wolURL?.toUpperCase().startsWith("WOL")) {
            const mac = this.wolURL.replace(/^WOL[:\/]*/i, "");
            return new Promise((resolve) => {
                wol.wake(mac, (error) => {
                    if (error) {
                        console.warn("[PhilipsTV WARN] WOL error:", error.message);
                    }
                    // Wait a bit for TV to wake up before sending power command
                    setTimeout(async () => {
                        try {
                            await this.api("powerstate", { powerstate: "On" });
                        } catch (e) {
                            console.warn("[PhilipsTV WARN] Power on after WOL failed:", e.message);
                        }
                        resolve();
                    }, 2000);
                });
            });
        } else {
            await this.api("powerstate", { powerstate: value ? "On" : "Standby" });
        }
    }

    async sendRemoteKey(key) {
        const map = {
            0: "Rewind", 1: "FastForward", 2: "Next", 3: "Previous",
            4: "CursorUp", 5: "CursorDown", 6: "CursorLeft", 7: "CursorRight",
            8: "Confirm", 9: "Back", 10: "Exit", 11: "PlayPause", 15: "Info"
        };
        if (map[key]) await this.api("input/key", { key: map[key] });
    }

    async getVolumeState() {
        let result = 50; // default
        try {
            const vol = await this.api("audio/volume");
            if (vol && vol.current !== undefined && vol.max !== undefined && vol.max > 0) {
                result = Math.round((vol.current / vol.max) * 100);
            } else {
                console.warn("[PhilipsTV WARN] Invalid volume data from TV, returning default 50. Data:", vol);
            }
        } catch (e) {
            console.warn("[PhilipsTV WARN] getVolumeState error, returning default 50:", e.message);
        }
        return result;
    }

    async setVolumeState(value) {
        const vol = await this.api("audio/volume");
        vol.current = Math.round(vol.max * (value / 100));
        await this.api("audio/volume", vol);
    }

    async getMuteState() {
        let result = false; // default
        try {
            const vol = await this.api("audio/volume");
            if (vol && vol.muted !== undefined) {
                result = vol.muted;
            } else {
                console.warn("[PhilipsTV WARN] Invalid mute data from TV, returning false. Data:", vol);
            }
        } catch (e) {
            console.warn("[PhilipsTV WARN] getMuteState error, returning false:", e.message);
        }
        return result;
    }

    async setMuteState(value) {        
        const vol = await this.api("audio/volume");
        vol.muted = value;
        await this.api("audio/volume", vol);
    }

    async setAmbilightMode(mode) {
        try {
            // First check if ambilight is available
            const power = await this.api("ambilight/power");
            if (!power || power.power !== "On") {
                // Turn on ambilight first
                await this.api("ambilight/power", { power: "On" });
            }

            // Map mode names to API values
            const modeMap = {
                "Follow Video": "FOLLOW_VIDEO",
                "Follow Audio": "FOLLOW_AUDIO", 
                "Lounge Light": "LOUNGE_LIGHT",
                "Manual": "MANUAL"
            };

            const apiMode = modeMap[mode] || "FOLLOW_VIDEO";

            // Set the mode
            await this.api("ambilight/mode", {
                current: apiMode
            });
        } catch (error) {
            console.warn("[PhilipsTV WARN] setAmbilightMode error:", error.message);
        }
    }

    async launchApp(packageName, className) {
        try {
            if (typeof packageName === 'object') {
                // If packageName is actually an app config object
                const intent = {
                    intent: {
                        component: {
                            packageName: packageName.packageName || packageName,
                            className: packageName.className || className
                        },
                        action: "android.intent.action.MAIN"
                    }
                };
                await this.api("activities/launch", intent);
            } else {
                // Simple package name
                const intent = {
                    intent: {
                        component: {
                            packageName: packageName,
                            className: className || packageName + ".MainActivity"
                        },
                        action: "android.intent.action.MAIN"
                    }
                };
                await this.api("activities/launch", intent);
            }
        } catch (error) {
            console.warn("[PhilipsTV WARN] launchApp error:", error.message);
        }
    }

    async setChannel(channel) {
        try {
            await this.api("activities/tv", {
                channel: {
                    ccid: channel,
                    preset: channel.toString(),
                    name: ""
                },
                channelList: {
                    id: "allter",
                    version: "30"
                }
            });
        } catch (error) {
            console.warn("[PhilipsTV WARN] setChannel error:", error.message);
        }
    }

    async getCurrentActivity() {
        try {
            const res = await this.api("activities/current");
            return res;
        } catch (error) {
            console.warn("[PhilipsTV WARN] getCurrentActivity error:", error.message);
            return null;
        }
    }

    getServices() {
        return this.services;
    }

}

module.exports = PhilipsTV;
