# Sistema Avanzado de Tickets — Bot de Discord

Un bot de Discord diseñado para gestionar un sistema de tickets avanzado con soporte por categorías, transcripciones automáticas, control de acceso y herramientas administrativas para el equipo de staff.

---

## Características Principales

- Sistema de tickets con selección de categorías (soporte, reporte, preguntas)
- Generación automática de transcripciones de cada ticket
- Lista negra de usuarios con control total desde comandos
- Estadísticas por usuario: seguimiento de uso del sistema
- Gestión de permisos personalizados para roles de staff
- Posibilidad de reabrir tickets previamente cerrados

---

## Requisitos de Configuración

### Permisos necesarios para el bot

- Ver canales  
- Enviar mensajes  
- Gestionar canales  
- Gestionar roles  
- Gestionar permisos  

## Si necesitas soporte unete a https://discord.gg/UNdMhq3Q7X

### Configuración inicial

Edita el archivo `interactioncreate.js` con los IDs correspondientes a tu servidor:

```js
{
  CATEGORIES: {
    soporte: 'ID_CATEGORIA_SOPORTE',
    reporte: 'ID_CATEGORIA_REPORTE',
    pregunta: 'ID_CATEGORIA_PREGUNTAS'
  },
  STAFF_ROLES: ['ID_ROL_STAFF_1', 'ID_ROL_STAFF_2'],
  LOGS_CHANNEL: 'ID_CANAL_LOGS'
}
## Si necesitas soporte unete a https://discord.gg/UNdMhq3Q7X

## Mejora echo por isamir sistema de idioma y otras mejoras
