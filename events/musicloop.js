const { EmbedBuilder } = require("discord.js");
const { createAudioResource } = require("@discordjs/voice");

const successHex = 0x7ae378;

/**
 * Format: servers = {
 *  guildId: {
 *    subscription: subscriptionObj,
 *    queue: [
 *      {foundSong, stream, requester},
 *      {foundSong, stream, requester}
 *    ],
 *    playing: boolean,
 *    stopped: boolean,
 *    paused: boolean,
 *    looped: boolean,
 *    channel: channelId,
 *  }
 * };
*/
const servers = {};

module.exports = {
    name: "ready",
    once: true,
    execute(client) {
        setInterval(async () => {
            try {
                for (const guildId of Object.keys(servers)) {
                    const server = servers[guildId];
                    if (server.queue.length > 0 && server.playing === false && server.stopped === false && server.paused === false) {
                        await playNext(server, client);
                    }
                }
            } catch (err) {
                console.log("An error occured in musicloop.js " + err);
            }
        }, 500);
    },
    servers,
};

async function playNext(server, client) {
    server.playing = true;

    const nowPlaying = server.queue[0];
    const foundSong = nowPlaying.foundSong;
    const stream = nowPlaying.stream;

    const songUrl = foundSong.url;
    const songTitle = foundSong.title;
    const songArtist = foundSong.author.name;
    const songThumbnail = foundSong.thumbnail;
    const songLength = foundSong.duration.timestamp;
    const requester = nowPlaying.requester;

    const targetChannel = client.channels.cache.find(channel => channel.id === server.channel);
    const playingMessage = new EmbedBuilder()
        .setColor(successHex)
        .setAuthor({ name: songArtist })
        .setTitle(songTitle)
        .setURL(songUrl)
        .setThumbnail(songThumbnail)
        .addFields(
            { name: "Duration", value: String(songLength) },
            { name: "Requested by", value: requester },
        );

    if (!stream) stream = await dlStream(foundSong.url);

    const songResource = createAudioResource(stream);
    server.subscription.player.play(songResource, { type: 'opus' });

    const sentMessage = await targetChannel.send({ embeds: [playingMessage] });

    let count = 0;
    const total = foundSong.duration.seconds * 1000 + 10;
    while (count < total) {
        const nextTimeout = (total - count) > 1000 ? 1000 : 10;
        await sleep(nextTimeout);
        if (server.playing) count += 1000;
        if (server.stopped) return;
    }

    if (server.queue[0] === nowPlaying) {
        const removed = server.queue.shift();

        if (server.looped) {
            const toLoop = {
                foundSong: removed,
                stream: await dlStream(foundSong.url),
                requester: removed.requester,
                url: removed.url
            }

            server.queue.push(toLoop);
        }
        sentMessage.delete()
            .catch(console.error);
        server.playing = false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
