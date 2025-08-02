/*
 * Comando para Dashboard Web Profesional
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const statsManager = require('../utils/StatsManager');
const languageManager = require('../utils/LanguageManager');
const express = require('express');
const path = require('path');

let dashboardServer = null;
const DASHBOARD_PORT = 3001;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('🌐 Gestionar dashboard web profesional')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Iniciar servidor del dashboard')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Detener servidor del dashboard')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Ver estado del dashboard')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('url')
                .setDescription('Obtener URL del dashboard')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ Solo administradores pueden gestionar el dashboard.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'start':
                    await this.startDashboard(interaction);
                    break;
                case 'stop':
                    await this.stopDashboard(interaction);
                    break;
                case 'status':
                    await this.dashboardStatus(interaction);
                    break;
                case 'url':
                    await this.getDashboardUrl(interaction);
                    break;
            }

        } catch (error) {
            console.error('Error en comando dashboard:', error);
            await interaction.reply({
                content: '❌ Error gestionando el dashboard.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    async startDashboard(interaction) {
        if (dashboardServer) {
            return interaction.reply({
                content: '⚠️ El dashboard ya está en funcionamiento.',
                ephemeral: true
            });
        }

        try {
            const app = express();
            
            // Configurar Express
            app.use(express.static(path.join(__dirname, '../dashboard/public')));
            app.use(express.json());

            // Ruta principal del dashboard
            app.get('/', (req, res) => {
                res.send(this.generateDashboardHTML(interaction.guild));
            });

            // API endpoints
            app.get('/api/stats', async (req, res) => {
                try {
                    const stats = await statsManager.getCompleteStats();
                    res.json(stats);
                } catch (error) {
                    res.status(500).json({ error: 'Error obteniendo estadísticas' });
                }
            });

            app.get('/api/realtime', async (req, res) => {
                try {
                    const realTimeMetrics = await statsManager.getRealTimeMetrics();
                    res.json(realTimeMetrics);
                } catch (error) {
                    res.status(500).json({ error: 'Error obteniendo métricas en tiempo real' });
                }
            });

            app.get('/api/staff-performance', async (req, res) => {
                try {
                    const staffReport = await statsManager.getStaffPerformanceReport();
                    res.json(staffReport);
                } catch (error) {
                    res.status(500).json({ error: 'Error obteniendo rendimiento del staff' });
                }
            });

            // Iniciar servidor
            dashboardServer = app.listen(DASHBOARD_PORT, () => {
                console.log(`🌐 Dashboard iniciado en puerto ${DASHBOARD_PORT}`);
            });

            const embed = new EmbedBuilder()
                .setTitle('🌐 Dashboard Iniciado')
                .setDescription('El dashboard web profesional está ahora activo')
                .setColor('#00FF00')
                .addFields(
                    {
                        name: '🔗 URL Local',
                        value: `http://localhost:${DASHBOARD_PORT}`,
                        inline: true
                    },
                    {
                        name: '📊 Funcionalidades',
                        value: '• Estadísticas en tiempo real\n• Rendimiento del staff\n• Métricas avanzadas\n• Gráficos interactivos',
                        inline: true
                    },
                    {
                        name: '🔧 Estado',
                        value: '🟢 Activo',
                        inline: true
                    }
                )
                .setFooter({
                    text: 'Dashboard Profesional v2.0'
                })
                .setTimestamp();

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('🌐 Abrir Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`http://localhost:${DASHBOARD_PORT}`),
                    new ButtonBuilder()
                        .setCustomId('dashboard_refresh')
                        .setLabel('🔄 Actualizar')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });

        } catch (error) {
            console.error('Error iniciando dashboard:', error);
            await interaction.reply({
                content: '❌ Error iniciando el dashboard web.',
                ephemeral: true
            });
        }
    },

    async stopDashboard(interaction) {
        if (!dashboardServer) {
            return interaction.reply({
                content: '⚠️ El dashboard no está en funcionamiento.',
                ephemeral: true
            });
        }

        try {
            dashboardServer.close(() => {
                console.log('🌐 Dashboard detenido');
            });
            dashboardServer = null;

            const embed = new EmbedBuilder()
                .setTitle('🌐 Dashboard Detenido')
                .setDescription('El dashboard web ha sido detenido exitosamente')
                .setColor('#FF0000')
                .addFields({
                    name: '🔧 Estado',
                    value: '🔴 Inactivo',
                    inline: true
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Error deteniendo dashboard:', error);
            await interaction.reply({
                content: '❌ Error deteniendo el dashboard.',
                ephemeral: true
            });
        }
    },

    async dashboardStatus(interaction) {
        const isRunning = dashboardServer !== null;
        
        const embed = new EmbedBuilder()
            .setTitle('🌐 Estado del Dashboard')
            .setDescription('Información actual del dashboard web')
            .setColor(isRunning ? '#00FF00' : '#FF0000')
            .addFields(
                {
                    name: '🔧 Estado',
                    value: isRunning ? '🟢 Activo' : '🔴 Inactivo',
                    inline: true
                },
                {
                    name: '🔗 Puerto',
                    value: DASHBOARD_PORT.toString(),
                    inline: true
                },
                {
                    name: '📊 Funcionalidades',
                    value: isRunning ? 
                        '• Estadísticas en tiempo real ✅\n• Rendimiento del staff ✅\n• API REST ✅\n• Interfaz web ✅' :
                        '• Todas las funcionalidades deshabilitadas ❌',
                    inline: false
                }
            )
            .setTimestamp();

        if (isRunning) {
            embed.addFields({
                name: '🌐 URL de Acceso',
                value: `http://localhost:${DASHBOARD_PORT}`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async getDashboardUrl(interaction) {
        if (!dashboardServer) {
            return interaction.reply({
                content: '❌ El dashboard no está activo. Usa `/dashboard start` para iniciarlo.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔗 URL del Dashboard')
            .setDescription('Accede al dashboard web profesional')
            .setColor('#FFD700')
            .addFields(
                {
                    name: '🌐 URL Local',
                    value: `http://localhost:${DASHBOARD_PORT}`,
                    inline: false
                },
                {
                    name: '📱 Compatibilidad',
                    value: 'Compatible con todos los navegadores modernos',
                    inline: true
                },
                {
                    name: '🔒 Seguridad',
                    value: 'Solo accesible localmente',
                    inline: true
                }
            )
            .setFooter({
                text: 'Dashboard creado especialmente para este servidor'
            })
            .setTimestamp();

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('🌐 Abrir Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`http://localhost:${DASHBOARD_PORT}`)
            );

        await interaction.reply({ embeds: [embed], components: [button], ephemeral: true });
    },

    generateDashboardHTML(guild) {
        return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard Profesional - ${guild.name}</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #333;
                    min-height: 100vh;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                .header {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 15px;
                    padding: 30px;
                    margin-bottom: 30px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                    text-align: center;
                }
                
                .header h1 {
                    color: #2c3e50;
                    font-size: 2.5rem;
                    margin-bottom: 10px;
                }
                
                .header p {
                    color: #7f8c8d;
                    font-size: 1.1rem;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .stat-card {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 15px;
                    padding: 25px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                    transition: transform 0.3s ease;
                }
                
                .stat-card:hover {
                    transform: translateY(-5px);
                }
                
                .stat-icon {
                    font-size: 2.5rem;
                    margin-bottom: 15px;
                }
                
                .stat-number {
                    font-size: 2rem;
                    font-weight: bold;
                    color: #2c3e50;
                    margin-bottom: 5px;
                }
                
                .stat-label {
                    color: #7f8c8d;
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                
                .charts-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 30px;
                    margin-bottom: 30px;
                }
                
                .chart-card {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 15px;
                    padding: 25px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                }
                
                .chart-title {
                    font-size: 1.3rem;
                    color: #2c3e50;
                    margin-bottom: 20px;
                    text-align: center;
                }
                
                .staff-table {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 15px;
                    padding: 25px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                    overflow-x: auto;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                th, td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid #eee;
                }
                
                th {
                    background: #f8f9fa;
                    font-weight: 600;
                    color: #2c3e50;
                }
                
                .refresh-btn {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    background: #3498db;
                    color: white;
                    border: none;
                    border-radius: 50px;
                    padding: 15px 25px;
                    font-size: 1rem;
                    cursor: pointer;
                    box-shadow: 0 5px 15px rgba(52, 152, 219, 0.4);
                    transition: all 0.3s ease;
                }
                
                .refresh-btn:hover {
                    background: #2980b9;
                    transform: translateY(-2px);
                    box-shadow: 0 8px 25px rgba(52, 152, 219, 0.5);
                }
                
                @media (max-width: 768px) {
                    .charts-container {
                        grid-template-columns: 1fr;
                    }
                    
                    .header h1 {
                        font-size: 2rem;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎫 Dashboard Profesional</h1>
                    <p>Sistema de Tickets Avanzado - ${guild.name}</p>
                </div>
                
                <div class="stats-grid" id="statsGrid">
                    <!-- Las estadísticas se cargarán aquí -->
                </div>
                
                <div class="charts-container">
                    <div class="chart-card">
                        <h3 class="chart-title">📊 Tickets por Categoría</h3>
                        <canvas id="categoryChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3 class="chart-title">📈 Tendencia Semanal</h3>
                        <canvas id="trendChart"></canvas>
                    </div>
                </div>
                
                <div class="staff-table">
                    <h3 class="chart-title">👥 Rendimiento del Staff</h3>
                    <table id="staffTable">
                        <thead>
                            <tr>
                                <th>Staff</th>
                                <th>Tickets</th>
                                <th>Tiempo Respuesta</th>
                                <th>Satisfacción</th>
                            </tr>
                        </thead>
                        <tbody id="staffTableBody">
                            <!-- Los datos del staff se cargarán aquí -->
                        </tbody>
                    </table>
                </div>
            </div>
            
            <button class="refresh-btn" onclick="loadDashboardData()">
                🔄 Actualizar
            </button>
            
            <script>
                let categoryChart = null;
                let trendChart = null;
                
                async function loadDashboardData() {
                    try {
                        // Cargar estadísticas generales
                        const statsResponse = await fetch('/api/stats');
                        const stats = await statsResponse.json();
                        
                        // Cargar métricas en tiempo real
                        const realtimeResponse = await fetch('/api/realtime');
                        const realtime = await realtimeResponse.json();
                        
                        // Cargar rendimiento del staff
                        const staffResponse = await fetch('/api/staff-performance');
                        const staffData = await staffResponse.json();
                        
                        updateStatsCards(realtime.current);
                        updateCharts(stats);
                        updateStaffTable(staffData);
                        
                    } catch (error) {
                        console.error('Error cargando datos:', error);
                    }
                }
                
                function updateStatsCards(current) {
                    const statsGrid = document.getElementById('statsGrid');
                    statsGrid.innerHTML = \`
                        <div class="stat-card">
                            <div class="stat-icon">🎫</div>
                            <div class="stat-number">\${current.totalTickets}</div>
                            <div class="stat-label">Total Tickets</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🟢</div>
                            <div class="stat-number">\${current.openTickets}</div>
                            <div class="stat-label">Tickets Abiertos</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">⏱️</div>
                            <div class="stat-number">\${current.avgResponseTime}</div>
                            <div class="stat-label">Tiempo Respuesta</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">⭐</div>
                            <div class="stat-number">\${current.satisfaction.toFixed(1)}</div>
                            <div class="stat-label">Satisfacción</div>
                        </div>
                    \`;
                }
                
                function updateCharts(stats) {
                    // Gráfico de categorías
                    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
                    if (categoryChart) categoryChart.destroy();
                    
                    categoryChart = new Chart(categoryCtx, {
                        type: 'doughnut',
                        data: {
                            labels: Object.keys(stats.tickets.byCategory),
                            datasets: [{
                                data: Object.values(stats.tickets.byCategory),
                                backgroundColor: [
                                    '#FF6384',
                                    '#36A2EB',
                                    '#FFCE56',
                                    '#4BC0C0',
                                    '#9966FF'
                                ]
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: {
                                    position: 'bottom'
                                }
                            }
                        }
                    });
                    
                    // Gráfico de tendencia
                    const trendCtx = document.getElementById('trendChart').getContext('2d');
                    if (trendChart) trendChart.destroy();
                    
                    const last7Days = Object.entries(stats.tickets.byDay)
                        .slice(-7)
                        .map(([date, count]) => ({date, count}));
                    
                    trendChart = new Chart(trendCtx, {
                        type: 'line',
                        data: {
                            labels: last7Days.map(d => d.date),
                            datasets: [{
                                label: 'Tickets Creados',
                                data: last7Days.map(d => d.count),
                                borderColor: '#36A2EB',
                                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: {
                            responsive: true,
                            scales: {
                                y: {
                                    beginAtZero: true
                                }
                            }
                        }
                    });
                }
                
                function updateStaffTable(staffData) {
                    const tbody = document.getElementById('staffTableBody');
                    tbody.innerHTML = staffData.slice(0, 10).map(staff => \`
                        <tr>
                            <td>Staff Member #\${staff.staffId.slice(-4)}</td>
                            <td>\${staff.ticketsHandled}</td>
                            <td>\${staff.avgResponseTime}</td>
                            <td>⭐ \${staff.avgSatisfaction}/5</td>
                        </tr>
                    \`).join('');
                }
                
                // Cargar datos iniciales
                loadDashboardData();
                
                // Actualizar automáticamente cada 30 segundos
                setInterval(loadDashboardData, 30000);
            </script>
        </body>
        </html>
        `;
    }
};