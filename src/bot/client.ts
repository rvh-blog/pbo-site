import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { config } from "./config";

// Extend client to include commands collection
export interface BotClient extends Client {
  commands: Collection<string, {
    data: { name: string; toJSON: () => object };
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  }>;
}

export function createClient(): BotClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // Required for prefix commands
    ],
  }) as BotClient;

  client.commands = new Collection();

  return client;
}

export async function loginClient(client: BotClient): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once(Events.ClientReady, (readyClient) => {
      console.log(`[Bot] Logged in as ${readyClient.user.tag}`);
      resolve();
    });

    client.once(Events.Error, (error) => {
      console.error("[Bot] Client error:", error);
      reject(error);
    });

    client.login(config.token).catch(reject);
  });
}
