module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`✅ Conectado como ${client.user.tag}`);

        const guildId = 'cambia por tu guildid'; // Cambia por el id de tu servidor
        const guild = await client.guilds.fetch(guildId).catch(() => null);

        const serverName = guild ? guild.name : 'el servidor';

        client.user.setPresence({
            status: 'dnd',
            activities: [
                {
                    name: `🛠️ ${serverName} | Sistema de soporte`, // puedes cambiar esto por 
                    // name: `🎟️ Ticket system activo en ${serverName}`, // Mas formal
                    // name: `📬 Soporte abierto en ${serverName}`,       // Mas directo
                    // name: `👨‍💻 Ayudando en ${serverName}`,            // Estilo tech
                    // name: `💼 Tickets de ${serverName}`,               // Mas corporativo
                    type: 4 
                }
            ]
        });

        console.log(`📛 Presencia establecida: DND - Gestionando tickets en ${serverName}`);
    }
};
