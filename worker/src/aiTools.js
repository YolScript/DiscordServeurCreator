import { botFetch, botFetchJson } from './discordApi.js';
import { createCustomChannel, createCustomCategory } from './customChannels.js';
import { getGuildConfig, putGuildConfig } from './kvStore.js';
import { logAudit } from './auditLog.js';

// Cles de configuration exposees a l'IA (roadmap n°135) : uniquement des
// reglages de modules surs et reversibles — JAMAIS les tokens, les listes
// d'acces dashboard ni aucun secret.
const AI_CONFIG_KEYS = {
  xpRate: { type: 'number', min: 0.5, max: 3, description: 'Multiplicateur de vitesse XP (0.5 a 3)' },
  starboardThreshold: { type: 'number', min: 2, max: 50, description: 'Nombre d etoiles requises pour le starboard' },
  autoCrosspost: { type: 'boolean', description: 'Publication croisee automatique dans les salons annonces' },
  arrivalDepartureChannelId: { type: 'channel', description: 'Salon des arrivees/departs et annonces de live' },
  modLogChannelId: { type: 'channel', description: 'Salon des logs de moderation' },
  announceChannelId: { type: 'channel', description: 'Salon des annonces' },
  suggestionChannelId: { type: 'channel', description: 'Salon des suggestions' },
  giveawayChannelId: { type: 'channel', description: 'Salon des giveaways' },
  reviewChannelId: { type: 'channel', description: 'Salon des avis de tickets' },
  starboardChannelId: { type: 'channel', description: 'Salon du starboard (hall of fame)' },
};

// Schemas exposes aux 3 fournisseurs IA (traduits par aiProviders.js dans le
// format propre a chacun). `destructive: true` = jamais execute directement,
// toujours renvoye au frontend comme proposition a confirmer.
export const AI_TOOLS = [
  {
    name: 'list_channels',
    destructive: false,
    description: 'Liste tous les salons et categories du serveur avec leurs identifiants, noms et types (text, voice, category).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_roles',
    destructive: false,
    description: 'Liste tous les roles du serveur avec leurs identifiants, noms et couleurs.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_channel',
    destructive: false,
    description: 'Cree un nouveau salon texte ou vocal, optionnellement range dans une categorie existante.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom du salon' },
        type: { type: 'string', enum: ['text', 'voice'] },
        categoryId: { type: 'string', description: 'Identifiant de la categorie parente (optionnel)' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'rename_channel',
    destructive: false,
    description: 'Renomme un salon existant (identifiant obtenu via list_channels).',
    parameters: {
      type: 'object',
      properties: { channelId: { type: 'string' }, newName: { type: 'string' } },
      required: ['channelId', 'newName'],
    },
  },
  {
    name: 'delete_channel',
    destructive: true,
    description: 'Supprime definitivement un salon. Action irreversible.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' } }, required: ['channelId'] },
  },
  {
    name: 'create_category',
    destructive: false,
    description: 'Cree une nouvelle categorie.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'delete_category',
    destructive: true,
    description: "Supprime definitivement une categorie (les salons qu'elle contient sont detaches, pas supprimes). Action irreversible.",
    parameters: { type: 'object', properties: { categoryId: { type: 'string' } }, required: ['categoryId'] },
  },
  {
    name: 'create_role',
    destructive: false,
    description: 'Cree un nouveau role.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string', description: 'Couleur hex, ex: #5865f2 (optionnel)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_role',
    destructive: false,
    description: 'Renomme un role existant (identifiant obtenu via list_roles).',
    parameters: {
      type: 'object',
      properties: { roleId: { type: 'string' }, newName: { type: 'string' } },
      required: ['roleId', 'newName'],
    },
  },
  {
    name: 'set_role_color',
    destructive: false,
    description: "Change la couleur d'un role.",
    parameters: {
      type: 'object',
      properties: { roleId: { type: 'string' }, color: { type: 'string', description: 'Couleur hex, ex: #5865f2' } },
      required: ['roleId', 'color'],
    },
  },
  {
    name: 'delete_role',
    destructive: true,
    description: 'Supprime definitivement un role. Action irreversible.',
    parameters: { type: 'object', properties: { roleId: { type: 'string' } }, required: ['roleId'] },
  },
  {
    name: 'get_module_config',
    destructive: false,
    description: 'Lit la configuration des modules du serveur : vitesse XP, seuil starboard, crosspost automatique, salons assignes aux modules (annonces, suggestions, giveaways, avis, logs, bienvenue). A appeler avant toute modification.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_module_config',
    destructive: false,
    description: "Modifie UN reglage de module du serveur. Cles autorisees : xpRate (0.5-3), starboardThreshold (2-50), autoCrosspost (true/false), arrivalDepartureChannelId, modLogChannelId, announceChannelId, suggestionChannelId, giveawayChannelId, reviewChannelId, starboardChannelId (ID de salon obtenu via list_channels).",
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Nom exact de la cle a modifier' },
        value: { type: 'string', description: 'Nouvelle valeur : nombre, true/false, ou ID de salon selon la cle' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'generate_embed',
    destructive: false,
    description: "Genere un embed Discord (titre, description, couleur hex, champs) pre-rempli dans le generateur du dashboard. Ne poste rien directement : l'utilisateur relit et publie lui-meme.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        color: { type: 'string', description: 'Couleur hex, ex: #5865f2 (optionnel)' },
        fields: {
          type: 'array',
          description: 'Champs optionnels (max 25)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
              inline: { type: 'boolean' },
            },
            required: ['name', 'value'],
          },
        },
      },
      required: ['title'],
    },
  },
];

export function findTool(name) {
  return AI_TOOLS.find((t) => t.name === name);
}

function hexToInt(hex) {
  if (!hex) return 0;
  const cleaned = hex.replace('#', '').trim();
  const value = parseInt(cleaned, 16);
  return Number.isNaN(value) ? 0 : value;
}

// Protection anti-abus : les IDs fournis par le modele (rename/delete) sont
// toujours revalides contre un appel Discord frais avant toute mutation,
// pour ne jamais agir sur un identifiant hallucine ou injecte.
async function assertChannelInGuild(env, guildId, channelId) {
  const channels = await botFetchJson(env, `/guilds/${guildId}/channels`);
  const found = channels.find((c) => c.id === channelId);
  if (!found) throw new Error(`Salon ${channelId} introuvable sur ce serveur.`);
  return found;
}

async function assertRoleInGuild(env, guildId, roleId) {
  const roles = await botFetchJson(env, `/guilds/${guildId}/roles`);
  const found = roles.find((r) => r.id === roleId);
  if (!found) throw new Error(`Role ${roleId} introuvable sur ce serveur.`);
  return found;
}

// Execute un tool deja valide (nom connu, si destructif deja confirme par
// l'utilisateur). Renvoie un objet serialisable simple (pas la reponse brute
// Discord) pour rester leger dans le message renvoye au modele.
export async function executeAiTool(env, guildId, session, name, args) {
  const config = (await getGuildConfig(env, guildId)) || {};

  switch (name) {
    case 'list_channels': {
      const channels = await botFetchJson(env, `/guilds/${guildId}/channels`);
      return channels
        .map((c) => ({
          id: c.id, name: c.name, type: c.type === 4 ? 'category' : c.type === 2 ? 'voice' : 'text', parentId: c.parent_id || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    case 'list_roles': {
      const roles = await botFetchJson(env, `/guilds/${guildId}/roles`);
      return roles.map((r) => ({ id: r.id, name: r.name, color: `#${(r.color || 0).toString(16).padStart(6, '0')}` }));
    }
    case 'create_channel': {
      const channel = await createCustomChannel(env, guildId, config, args);
      await logAudit(env, guildId, { title: 'Salon cree (IA)', description: `${session.username} a demande la creation de #${args.name} via l'assistant IA.` });
      return { id: channel.id, name: channel.name };
    }
    case 'rename_channel': {
      await assertChannelInGuild(env, guildId, args.channelId);
      const channel = await botFetchJson(env, `/channels/${args.channelId}`, { method: 'PATCH', body: JSON.stringify({ name: args.newName }) });
      await logAudit(env, guildId, { title: 'Salon renomme (IA)', description: `${session.username} a renomme un salon en #${args.newName} via l'assistant IA.` });
      return { id: channel.id, name: channel.name };
    }
    case 'delete_channel': {
      const channel = await assertChannelInGuild(env, guildId, args.channelId);
      await botFetch(env, `/channels/${args.channelId}`, { method: 'DELETE' });
      await logAudit(env, guildId, { title: 'Salon supprime (IA)', description: `${session.username} a supprime #${channel.name} via l'assistant IA.` });
      return { deleted: args.channelId };
    }
    case 'create_category': {
      const category = await createCustomCategory(env, guildId, config, args);
      await logAudit(env, guildId, { title: 'Categorie creee (IA)', description: `${session.username} a demande la creation de la categorie ${args.name} via l'assistant IA.` });
      return { id: category.id, name: category.name };
    }
    case 'delete_category': {
      const category = await assertChannelInGuild(env, guildId, args.categoryId);
      await botFetch(env, `/channels/${args.categoryId}`, { method: 'DELETE' });
      await logAudit(env, guildId, { title: 'Categorie supprimee (IA)', description: `${session.username} a supprime la categorie ${category.name} via l'assistant IA.` });
      return { deleted: args.categoryId };
    }
    case 'create_role': {
      const role = await botFetchJson(env, `/guilds/${guildId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ name: args.name.slice(0, 100), color: hexToInt(args.color), mentionable: false }),
      });
      await logAudit(env, guildId, { title: 'Role cree (IA)', description: `${session.username} a cree le role ${args.name} via l'assistant IA.` });
      return { id: role.id, name: role.name };
    }
    case 'rename_role': {
      await assertRoleInGuild(env, guildId, args.roleId);
      const role = await botFetchJson(env, `/guilds/${guildId}/roles/${args.roleId}`, { method: 'PATCH', body: JSON.stringify({ name: args.newName }) });
      await logAudit(env, guildId, { title: 'Role renomme (IA)', description: `${session.username} a renomme un role en ${args.newName} via l'assistant IA.` });
      return { id: role.id, name: role.name };
    }
    case 'set_role_color': {
      await assertRoleInGuild(env, guildId, args.roleId);
      const role = await botFetchJson(env, `/guilds/${guildId}/roles/${args.roleId}`, { method: 'PATCH', body: JSON.stringify({ color: hexToInt(args.color) }) });
      await logAudit(env, guildId, { title: 'Couleur de role modifiee (IA)', description: `${session.username} a change la couleur d'un role via l'assistant IA.` });
      return { id: role.id, color: args.color };
    }
    case 'delete_role': {
      const role = await assertRoleInGuild(env, guildId, args.roleId);
      await botFetch(env, `/guilds/${guildId}/roles/${args.roleId}`, { method: 'DELETE' });
      await logAudit(env, guildId, { title: 'Role supprime (IA)', description: `${session.username} a supprime le role ${role.name} via l'assistant IA.` });
      return { deleted: args.roleId };
    }
    case 'get_module_config': {
      const out = {};
      for (const [key, spec] of Object.entries(AI_CONFIG_KEYS)) {
        out[key] = { value: config[key] ?? null, description: spec.description };
      }
      if (config.twitchBroadcasterLogin) {
        out.twitchBroadcasterLogin = { value: config.twitchBroadcasterLogin, description: 'Compte Twitch lie (lecture seule)' };
      }
      return out;
    }
    case 'set_module_config': {
      const spec = AI_CONFIG_KEYS[args.key];
      if (!spec) throw new Error(`Cle inconnue ou non autorisee : ${args.key}`);
      let value;
      if (spec.type === 'number') {
        value = Number(args.value);
        if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
          throw new Error(`Valeur invalide pour ${args.key} (attendu : ${spec.min} a ${spec.max}).`);
        }
      } else if (spec.type === 'boolean') {
        value = String(args.value) === 'true';
      } else {
        await assertChannelInGuild(env, guildId, String(args.value));
        value = String(args.value);
      }
      const fresh = (await getGuildConfig(env, guildId)) || {};
      await putGuildConfig(env, guildId, { ...fresh, [args.key]: value });
      await logAudit(env, guildId, { title: 'Config modifiee (IA)', description: `${session.username} a change ${args.key} via l'assistant IA.` });
      return { key: args.key, value, saved: true };
    }
    case 'generate_embed': {
      const embed = {
        title: String(args.title || '').slice(0, 256),
        description: args.description ? String(args.description).slice(0, 4096) : undefined,
        color: hexToInt(args.color) || 0x5865f2,
        fields: Array.isArray(args.fields)
          ? args.fields.slice(0, 25).map((f) => ({
            name: String(f.name || '').slice(0, 256), value: String(f.value || '').slice(0, 1024), inline: Boolean(f.inline),
          }))
          : [],
      };
      return { embed };
    }
    default:
      throw new Error(`Outil inconnu : ${name}`);
  }
}
