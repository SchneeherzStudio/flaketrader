import { ShardingManager } from "discord.js";
import 'dotenv/config';

const manager = new ShardingManager('./index.js', {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto'
});

manager.on('shardCreate', shard => console.log(`Launched shard ${shard.id}`));
manager.spawn();