const ytdl = require("ytdl-core-discord");
const yts = require("yt-search");
const servers = require("./musicloop").servers;

module.exports = {
    name: "ready",
    once: true,
    execute(client) {
        setInterval(async () => {
            try {
                for (const guildId of Object.keys(servers)) {
                    const server = servers[guildId];
                    conductDownload(server.queue);
                }
            } catch (err) {
                console.log("An error occured in musicdownloader.js " + err);
            }
        }, 500);
    },
};

async function conductDownload(queue) {
    for (item of queue) {
        if (item.stream) continue;
        if (!item.url && !item.thumbnail) {
            const search = await yts(`${item.title} ${item.author}`);
            const song = search.videos ? search.videos[0] : search.videoId ? search : null;
            if (song === null) {
                continue;
            }

            item.url = song.url ? song.url : `https://youtube.com/watch?v=${song.videoId}`;
            item.thumbnail = song.thumbnail;
        }

        item.stream = await dlStream(item.url);
    }
}

async function dlStream(url) {
    return await ytdl(url, {
        filter: 'audioonly',
        fmt: 'mp3',
        highWaterMark: 1 << 30,
        liveBuffer: 20000,
        dlChunkSize: 0,
        bitrate: 128,
        quality: 'lowestaudio'
    });
}