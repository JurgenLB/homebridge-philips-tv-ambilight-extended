const request = require("request");
const wol = require('wake_on_lan');

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
    }


    api(path, body = null) {
        return new Promise((resolve, reject) => {
            request({
                rejectUnauthorized: false,
                timeout: 3000,
                auth: {
                    user: this.config.username,
                    pass: this.config.password,
                    sendImmediately: false
                },
                method: body ? "POST" : "GET",
                body: body ? JSON.stringify(body) : null,
                url: this.apiUrl + path
            }, (err, res, body) => {
                if (err) return reject(err);
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch {
                    resolve({});
                }
            });
        });
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
            wol.wake(mac, () => {});
        }
        await this.api("powerstate", { powerstate: value ? "On" : "Standby" });
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
        try {
            const vol = await this.api("audio/volume");
            return Math.round((vol.current / vol.max) * 100);
        } catch {
            return 50;
        }
    }

    async setVolumeState(value) {
        const vol = await this.api("audio/volume");
        vol.current = Math.round(vol.max * (value / 100));
        await this.api("audio/volume", vol);
    }

    async getMuteState() {
        try {
            const vol = await this.api("audio/volume");
            return vol.muted;
        } catch {
            return false;
        }
    }

    async setMuteState(value) {
        const vol = await this.api("audio/volume");
        vol.muted = value;
        await this.api("audio/volume", vol);
    }

    async setAmbilightMode(mode) {
        await this.api("ambilight/currentconfiguration", {
            styleName: mode,
            isExpert: false,
            menuSetting: "NATURAL"
        });
    }
}

module.exports = PhilipsTV;
