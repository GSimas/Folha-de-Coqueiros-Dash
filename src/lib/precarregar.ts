/**
 * Imports dos chunks sob demanda. Centralizados para que o App (React.lazy) e
 * os gatilhos de intenção (hover/foco) peçam exatamente o mesmo módulo.
 */
export const carregarChat = () => import('@/components/ChatbotDrawer');
export const carregarPerfil = () => import('@/components/PerfilModal');
