const { MessageEmbed } = require("discord.js");
const successHex = 0x7ae378;
const { createAudioResource } = require("@discordjs/voice");

/**
 * Format: servers = {
 *  guildId: {
 *    subscription: subscriptionObj,
 *    queue: [
 *      {foundSong, stream, requester},
 *      {foundSong, stream, requester}
 *    ],
 *    playing: boolean,
 *    looped: boolean,
 *    channel: channelId
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
                for (const guildId in Object.keys(servers)) {
                    const server = servers[guildId];
                    if (server.queue.length > 0 && server.playing === false) {
                        playNext(server, client);
                    }
                }
            } catch (err) {
                console.log("An error occured in standupReset.js " + err);
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
    const playingMessage = new MessageEmbed()
        .setColor(successHex)
        .setAuthor({ name: songArtist })
        .setTitle(songTitle)
        .setURL(songUrl)
        .setThumbnail(songThumbnail)
        .addFields(
            { name: "Duration", value: songLength },
            { name: "Requested by", value: requester },
        );

    const songResource = createAudioResource(stream);
    server.player.play(songResource);

    const sentMessage = await targetChannel.send({ embeds: [playingMessage] });

    await sleep(foundSong.duration.seconds * 1000 + 10);

    if (server.queue[0] === nowPlaying) {
        const removed = server.queue.shift();
        if (server.looped) {
            server.queue.push(removed);
        }
        sentMessage.delete()
            .catch(console.error);
        server.playing = false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
