const { SlashCommandBuilder } = require("@discordjs/builders");
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer } = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const yts = require("yt-search");

const ytIdGrab = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;

const servers = require("../events/musicloop").servers;

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
// Loop that checks if there is something in the queue when run and plays it if there is something and playing is false, otherwise waits?

/** Music Features
 * - join
 * - leave
 * - play
 * - queue
 * - pause
 * - resume
 * - stop
 * - clear
 * - playnext
 * - playnow
 * - remove
 * - shuffle
 * - loop
 * - move
 */

module.exports = {
    data: new SlashCommandBuilder()
        .setName("music")
        .setDescription("Manages a music player!")
        .addSubcommand(subcommand =>
            subcommand
                .setName("join")
                .setDescription("Joins your current voice channel."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("leave")
                .setDescription("Leaves your current voice channel."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("play")
                .setDescription("Plays a song, from a url or search, if no song is playing or adds a song to the queue.")
                .addStringOption(option => option.setName("song").setDescription("Song input to play").setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("queue")
                .setDescription("Displays the current queue.")
                .addIntegerOption(option => option.setName("page").setDescription("Requested page of the queue")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("pause")
                .setDescription("Pauses playback of the queue."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("resume")
                .setDescription("Resumes playback of the queue."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("stop")
                .setDescription("Stops current playback and clears the queue."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Clears the current queue."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("playnext")
                .setDescription("Adds a song, from url or search, to the beginning of the queue.")
                .addStringOption(option => option.setName("song").setDescription("Song input to play").setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("playnow")
                .setDescription("Plays a song, from url or search, and pushes the current song back into the queue.")
                .addStringOption(option => option.setName("song").setDescription("Song input to play").setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Removes a song from the current queue by position.")
                .addIntegerOption(option => option.setName("remove_pos").setDescription("Position to remove the song from").setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("shuffle")
                .setDescription("Shuffles the current queue."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("loop")
                .setDescription("Loops the current queue."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("move")
                .setDescription("Moves a song into another position in the queue.")
                .addIntegerOption(option => option.setName("cur_pos").setDescription("Position of song to be moved").setRequired(true))
                .addIntegerOption(option => option.setName("new_pos").setDescription("Target position for the moved song").setRequired(true))),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const channelType = interaction.channel.type;
        const userVoiceChannel = interaction.member.voice.channel;
        const connection = getVoiceConnection(guildId);
        let serverData = servers[guildId];

        if (channelType != "GUILD_TEXT") {
            const ephemeralError = { content: "You cannot use this command in this channel, please try again in a server text channel.", ephemeral: true };

            await interaction.reply(ephemeralError);
            return;
        } else if (!userVoiceChannel) {
            const ephemeralError = { content: "You must be in a voice channel to use this command, please try again after joining a voice channel.", ephemeral: true };

            await interaction.reply(ephemeralError);
            return;
        }

        if (interaction.options.getSubcommand() === "join") {
            // Joins vc if queue empty or not in vc
            if (!(guildId in servers) || serverData.queue.length === 0) {
                startConnection(interaction, userVoiceChannel);
                serverData = servers[guildId];

                const success = { content: "The bot has joined your voice channel.", ephemeral: false };

                await interaction.reply(success);
            } else {
                const ephemeralError = { content: "The bot is currently playing music in another voice channel, please try later.", ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "leave") {
            // Leaves vc if in vc
            if (guildId in servers) {
                // Unsubscribes from audio player and removes, if existent
                if (serverData.subscription !== undefined) {
                    serverData.subscription.unsubscribe();
                    serverData.subscription.player.stop();
                }

                connection.destroy();
                delete servers[guildId];

                const success = { content: "The bot has left your voice channel.", ephemeral: false };

                await interaction.reply(success);
            } else {
                const ephemeralError = { content: "The bot is not currently in a voice channel.", ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "play") {
            await interaction.deferReply();

            // Joins vc if not in vc
            if (!connection) {
                startConnection(interaction, userVoiceChannel);
                serverData = servers[guildId];
            }

            // Gets information from play command and appends inputted song
            const { foundSong, stream } = await generateSong(interaction);
            serverData.queue.push({ foundSong, stream });

            // Subscribes an audio player, if not existent
            if (!serverData.subscription) {
                const player = createAudioPlayer();
                const newSubscription = connection.subscribe(player);
                serverData.subscription = newSubscription;
            }

            const successMsg = `Added \`${foundSong.title}\` to position \`${serverData.queue.length}\` in the queue.`;

            await interaction.editReply(successMsg);
        } else if (interaction.options.getSubcommand() === "queue") {
            if (serverData.queue.length === 0) {
                // TODO - requires queue pagination
                console.log("queue");
            }
        } else if (interaction.options.getSubcommand() === "pause") {
            if (serverData.queue.length !== 0) {
                serverData.subscription.player.pause();
                serverData.subscription.connection.setSpeaking(false);
                serverData.playing = false;
            } else {
                const ephemeralError = { content: "The bot cannot be paused as it is not currently playing any tracks.", ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "resume") {
            if (serverData.queue.length !== 0) {
                if (serverData.subscription.player.checkPlayable()) {
                    serverData.subscription.player.unpause();
                    serverData.subscription.connection.setSpeaking(true);
                    serverData.playing = true;
                }
            } else {
                const ephemeralError = { content: "The bot cannot be resumed as the queue is empty.", ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "stop") {
            if (serverData.queue.length !== 0) {
                serverData.subscription.player.stop();
                serverData.playing = false;
            } else {
                const ephemeralError = { content: "The bot cannot be stopped as the bot is not playing anything.", ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "clear") {
            if (serverData.queue.length !== 0) {
                serverData.subscription.player.stop();
                serverData.playing = false;
                serverData.queue = [];
            } else {
                const ephemeralError = { content: "The queue cannot be cleared as it is already empty.", ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "playnext") {
            await interaction.deferReply();

            // Joins vc if not in vc
            if (!connection) {
                startConnection(interaction, userVoiceChannel);
                serverData = servers[guildId];
            }

            // Gets information from play command and appends inputted song
            const { foundSong, stream } = await generateSong(interaction);
            // Adds to the second position in the queue
            serverData.queue.splice(1, 0, { foundSong, stream });

            // Subscribes an audio player, if not existent
            if (!serverData.subscription) {
                const player = createAudioPlayer();
                const newSubscription = connection.subscribe(player);
                serverData.subscription = newSubscription;
            }

            const successMsg = `Added \`${foundSong.title}\` to the start of the queue.`;
            await interaction.editReply(successMsg);
        } else if (interaction.options.getSubcommand() === "playnow") {
            await interaction.deferReply();

            // Joins vc if not in vc
            if (!connection) {
                startConnection(interaction, userVoiceChannel);
                serverData = servers[guildId];
            }

            // Gets information from play command and appends inputted song
            const { foundSong, stream } = await generateSong(interaction);
            // Adds to the start of the queue
            serverData.queue.unshift({ foundSong, stream });

            // Subscribes an audio player, if not existent
            if (!serverData.subscription) {
                const player = createAudioPlayer();
                const newSubscription = connection.subscribe(player);
                serverData.subscription = newSubscription;
            }

            serverData.playing = false;

            const successMsg = `Now playing \`${foundSong.title}\`.`;
            await interaction.editReply(successMsg);
        } else if (interaction.options.getSubcommand() === "remove") {
            const index = interaction.options.getInteger("remove_pos");

            // Checks that the index is less than or equal to the queue length and greater than the currently playing song
            if (serverData.queue.length >= index && index > 1) {
                const removed = serverData.queue.splice(index - 1, 1)[0];

                const successMsg = `Removed \`${removed.title}\` from position \`${index}\` of the queue.`;
                await interaction.editReply(successMsg);
            } else {
                const ephemeralError = { content: `There is no removable song in position \`${index}\`.`, ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "shuffle") {
            // Checks whether the queue can be shuffled, and shuffles it if so
            if (serverData.queue.length > 2) {
                await interaction.deferReply();

                shuffle(serverData.queue);
                const successMsg = "The queue has now been shuffled.";
                await interaction.editReply(successMsg);
            } else {
                const ephemeralError = { content: "The queue has insufficient songs to be shuffled.", ephemeral: true };

                await interaction.reply(ephemeralError);
            }
        } else if (interaction.options.getSubcommand() === "loop") {
            // Toggles looping for queue
            if (serverData.looped) {
                serverData.looped = false;
                const successMsg = "The queue is no longer looping.";
                await interaction.editReply(successMsg);
            } else {
                serverData.looped = true;
                const successMsg = "The queue is now looping.";
                await interaction.editReply(successMsg);
            }
        } else if (interaction.options.getSubcommand() === "move") {
            const oldIndex = interaction.options.getInteger("cur_pos");
            const newIndex = interaction.options.getInteger("new_pos");
            // Moves song given valid positions
            if (serverData.queue.length < oldIndex || oldIndex <= 1) {
                const ephemeralError = { content: `There is no movable song in initial position \`${oldIndex}\`.`, ephemeral: true };

                await interaction.reply(ephemeralError);
            } else if (serverData.queue.length < newIndex || newIndex <= 1) {
                const ephemeralError = { content: `There is no movable song in target position \`${newIndex}\`.`, ephemeral: true };

                await interaction.reply(ephemeralError);
            } else {
                const moved = serverData.queue.splice(oldIndex - 1, 1)[0];
                serverData.queue.splice(newIndex - 1, 0, moved);

                const successMsg = `Moved \`${moved.title}\` from position \`${oldIndex}\` to position \`${newIndex}\` of the queue.`;
                await interaction.editReply(successMsg);
            }
        }
    },
};

// Fetches song details and stream from input song
async function generateSong(interaction) {
    const songInput = interaction.options.getString("song");
    const requester = interaction.member.displayName;

    let songSearch;
    if (!(songInput.includes("youtube.com") || songInput.includes("youtu.be"))) {
        songSearch = songInput;
    } else {
        songSearch = { videoId : songInput.match(ytIdGrab)[1] };
    }

    const output = await yts(songSearch);
    let foundSong;
    if (output.videos) {
        foundSong = output.videos[0];
    } else {
        foundSong = output;
    }

    const stream = ytdl(foundSong.url, { filter: "audioonly", dlChunkSize: 0, highWaterMark: 1 << 25 });

    return { foundSong, stream, requester };
}

// Commences a voice connection in an inputted voice channel
function startConnection(interaction, userVoiceChannel) {
    joinVoiceChannel({
        channelId: userVoiceChannel.id,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
    });
    servers[interaction.guildId] = { subscription: undefined, queue: [], playing: false, looped: false, channel: interaction.channelId };
}

// Shuffles all items in an array excluding the first
function shuffle(array) {
    const saved = array.shift();
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    array.unshift(saved);
}

