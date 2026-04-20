// server.js - VERSIÓN CORREGIDA
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

/**
 * Multiplexor de Language Server Protocol (LSP)
 * 
 * Actúa como un proxy que permite que múltiples clientes WebSocket compartan
 * una única instancia del servidor LSP, multiplexando mensajes entre ellos.
 * 
 * @class LSPMultiplexer
 * @description Gestiona el ciclo de vida del servidor LSP y distribuye mensajes
 *              a todos los clientes conectados, manteniendo el estado de inicialización
 *              y manejando la reconexión de clientes posteriores.
 */
class LSPMultiplexer {
    /**
     * Crea una instancia del multiplexor LSP
     * 
     * @constructor
     * @param {number} [port=3000] - Puerto para el servidor WebSocket
     * @throws {Error} Si no se puede iniciar el proceso LSP o el servidor WebSocket
     */
    constructor(port = 3000) {
        /** @property {number} port - Puerto del servidor WebSocket */
        this.port = port;
        
        /** @property {string} language - Lenguaje del LSP (python|cpp|typescript) */
        this.language = process.env.LANGUAGE || 'python';
        
        /** @property {string} workDir - Directorio de trabajo para el LSP */
        this.workDir = process.env.WORKDIR || '/workspace';
        
        /** @property {ChildProcess} lspProcess - Proceso hijo del servidor LSP */
        this.lspProcess = null;
        
        /** @property {Set<WebSocket>} clients - Conjunto de clientes WebSocket conectados */
        this.clients = new Set();
        
        /** @property {boolean} isInitialized - Indica si el LSP ya fue inicializado */
        this.isInitialized = false;
        
        /** @property {number} maxClients - Número máximo de clientes simultáneos */
        this.maxClients = parseInt(process.env.MAX_CLIENTS) || 4;
        
        /** @property {Object} cachedCapabilities - Capacidades del LSP cacheadas */
        this.cachedCapabilities = {};
        
        /** @property {string} lspBuffer - Buffer para mensajes LSP incompletos */
        this.lspBuffer = '';
        
        /** @property {number|null} contentLength - Longitud esperada del mensaje actual */
        this.contentLength = null;
        
        // Inicializar componentes
        this.startLSP();
        this.setupWebSocket();
    }

    /**
     * Inicia el proceso del servidor LSP
     * 
     * @description Configura y ejecuta el comando LSP según el lenguaje seleccionado,
     *              establece los manejadores de eventos para stdout, stderr y close.
     * @returns {void}
     * @emits {Event} 'data' - Cuando el LSP envía datos por stdout/stderr
     * @emits {Event} 'close' - Cuando el proceso LSP termina
     */
    startLSP() {
        const lspConfig = this.getLSPConfig();
        
        console.log(`[LSPMultiplexer] Iniciando ${this.language} LSP`);
        console.log(`[LSPMultiplexer] Comando: ${lspConfig.command} ${lspConfig.args.join(' ')}`);
        
        // Crear proceso hijo del LSP
        this.lspProcess = spawn(lspConfig.command, lspConfig.args, {
            cwd: this.workDir,
            env: { ...process.env, ...lspConfig.env }
        });

        /**
         * Manejador de errores del LSP
         * @listens stderr
         */
        this.lspProcess.stderr.on('data', (data) => {
            console.error(`[LSP] stderr: ${data.toString()}`);
        });

        /**
         * Manejador de cierre del proceso LSP
         * @listens close
         */
        this.lspProcess.on('close', (code) => {
            console.log(`[LSP] Proceso terminado con código ${code}`);
            this.lspProcess = null;
            this.isInitialized = false;
            
            // Cerrar todas las conexiones de clientes
            this.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.close(1011, 'LSP process terminated');
                }
            });
            this.clients.clear();
        });

        /**
         * Manejador de salida estándar del LSP
         * @listens stdout
         */
        this.lspProcess.stdout.on('data', (data) => {
            this.handleLSPData(data.toString());
        });
    }

    /**
     * Procesa los datos recibidos del LSP manejando el protocolo Content-Length
     * 
     * @description Implementa el parsing del formato LSP estándar que usa headers
     *              Content-Length seguido de JSON. Acumula datos en buffer hasta
     *              tener mensajes completos para procesar.
     * @param {string} chunk - Fragmento de datos recibido del LSP
     * @returns {void}
     */
    handleLSPData(chunk) {
        this.lspBuffer += chunk;
        
        while (this.lspBuffer.length > 0) {
            // Si no tenemos content-length, intentar leer el header
            if (this.contentLength === null) {
                const headerEnd = this.lspBuffer.indexOf('\r\n\r\n');
                if (headerEnd === -1) {
                    // Header incompleto, esperar más datos
                    break;
                }
                
                const header = this.lspBuffer.substring(0, headerEnd);
                const contentLengthMatch = header.match(/Content-Length: (\d+)/i);
                
                if (!contentLengthMatch) {
                    console.error('[LSP] No se encontró Content-Length en:', header);
                    this.lspBuffer = this.lspBuffer.substring(headerEnd + 4);
                    continue;
                }
                
                this.contentLength = parseInt(contentLengthMatch[1]);
                this.lspBuffer = this.lspBuffer.substring(headerEnd + 4);
            }
            
            // Verificar si tenemos el mensaje completo
            if (this.lspBuffer.length >= this.contentLength) {
                const messageStr = this.lspBuffer.substring(0, this.contentLength);
                this.lspBuffer = this.lspBuffer.substring(this.contentLength);
                this.contentLength = null;
                
                try {
                    const message = JSON.parse(messageStr);
                    console.log(`[LSP] Mensaje recibido: ${message.method || 'response'}`);
                    
                    // Cachear capacidades del LSP para clientes futuros
                    if (message.id && message.result && message.result.capabilities) {
                        this.cachedCapabilities = message.result.capabilities;
                        console.log('[LSP] Capacidades cacheadas');
                    }
                    
                    // Distribuir mensaje a todos los clientes
                    this.broadcast(message);
                } catch (e) {
                    console.error('[LSP] Error parseando mensaje:', e.message);
                    console.error('[LSP] Contenido problemático:', messageStr.substring(0, 200));
                }
            } else {
                // Mensaje incompleto, esperar más datos
                break;
            }
        }
    }

    /**
     * Obtiene la configuración del LSP según el lenguaje
     * 
     * @description Retorna el comando, argumentos y variables de entorno
     *              necesarias para cada servidor LSP soportado.
     * @returns {Object} Configuración del LSP
     * @returns {string} returns.command - Comando ejecutable del LSP
     * @returns {string[]} returns.args - Argumentos de línea de comandos
     * @returns {Object} returns.env - Variables de entorno adicionales
     */
    getLSPConfig() {
        const configs = {
            python: {
                command: 'pylsp',
                args: [],
                env: { PYTHONPATH: this.workDir }
            },
            cpp: {
                command: 'clangd',
                args: ['--compile-commands-dir=' + this.workDir],
                env: {}
            },
            typescript: {
                command: 'typescript-language-server',
                args: ['--stdio'],
                env: {}
            }
        };
        
        return configs[this.language] || configs.python;
    }

    /**
     * Configura y inicia el servidor WebSocket
     * 
     * @description Crea un servidor WebSocket que acepta conexiones de clientes,
     *              aplica límite de conexiones y configura manejadores de eventos
     *              para mensajes, cierre y errores.
     * @returns {void}
     * @emits {Event} 'connection' - Cuando un nuevo cliente se conecta
     */
    setupWebSocket() {
        this.wss = new WebSocketServer({ 
            port: this.port,
            host: '0.0.0.0'
        });

        console.log(`[LSPMultiplexer] WebSocket escuchando en puerto ${this.port}`);
        console.log(`[LSPMultiplexer] Máximo de clientes: ${this.maxClients}`);

        /**
         * Manejador de nuevas conexiones WebSocket
         * @listens connection
         */
        this.wss.on('connection', (ws, req) => {
            // Validar límite de clientes
            if (this.clients.size >= this.maxClients) {
                console.warn(`[LSPMultiplexer] Cliente rechazado: límite alcanzado (${this.maxClients})`);
                ws.close(1013, `Maximum clients reached (${this.maxClients})`);
                return;
            }

            const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            console.log(`[LSPMultiplexer] Nuevo cliente conectado: ${clientId}`);
            console.log(`[LSPMultiplexer] Total clientes: ${this.clients.size + 1}/${this.maxClients}`);
            
            this.clients.add(ws);
            
            // Notificar al cliente si el LSP ya está inicializado
            if (this.isInitialized) {
                ws.send(JSON.stringify({
                    jsonrpc: "2.0",
                    method: "window/logMessage",
                    params: {
                        type: 3,
                        message: `Connected to existing LSP session (${this.clients.size} clients)`
                    }
                }));
            }

            /**
             * Manejador de mensajes del cliente
             * @listens message
             */
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleClientMessage(ws, message);
                } catch (e) {
                    console.error(`[${clientId}] Error parseando mensaje:`, e);
                }
            });

            /**
             * Manejador de cierre de conexión
             * @listens close
             */
            ws.on('close', () => {
                console.log(`[LSPMultiplexer] Cliente desconectado: ${clientId}`);
                this.clients.delete(ws);
                console.log(`[LSPMultiplexer] Clientes restantes: ${this.clients.size}/${this.maxClients}`);
                
                // Programar shutdown si no quedan clientes
                if (this.clients.size === 0) {
                    this.scheduleShutdown();
                }
            });

            /**
             * Manejador de errores WebSocket
             * @listens error
             */
            ws.on('error', (error) => {
                console.error(`[${clientId}] Error WebSocket:`, error);
                this.clients.delete(ws);
            });
        });
    }

    /**
     * Procesa mensajes enviados por los clientes
     * 
     * @description Maneja lógica especial para el método 'initialize',
     *              cacheando respuestas para clientes posteriores y reenviando
     *              otros mensajes al LSP.
     * @param {WebSocket} ws - Conexión WebSocket del cliente
     * @param {Object} message - Mensaje JSON-RPC del cliente
     * @param {string} message.method - Método JSON-RPC
     * @param {*} message.id - ID de la solicitud (para responses)
     * @param {Object} message.params - Parámetros del método
     * @returns {void}
     */
    handleClientMessage(ws, message) {
        // Manejo especial del método initialize
        if (message.method === 'initialize') {
            if (!this.isInitialized) {
                // Primer cliente: inicializar LSP
                console.log('[LSPMultiplexer] Primera inicialización del LSP');
                this.isInitialized = true;
                this.sendToLSP(message);
            } else {
                // Clientes adicionales: responder desde cache
                console.log('[LSPMultiplexer] Cliente adicional - LSP ya inicializado');
                ws.send(JSON.stringify({
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        capabilities: this.cachedCapabilities || {}
                    }
                }));
            }
            return;
        }

        // Reenviar otros mensajes al LSP si el proceso está disponible
        if (this.lspProcess && this.lspProcess.stdin.writable) {
            this.sendToLSP(message);
        }
    }

    /**
     * Envía un mensaje al proceso LSP con el formato correcto
     * 
     * @description Formatea el mensaje JSON-RPC según el protocolo LSP,
     *              añadiendo el header Content-Length necesario.
     * @param {Object} message - Mensaje JSON-RPC a enviar
     * @returns {void}
     */
    sendToLSP(message) {
        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
        
        console.log(`[LSPMultiplexer] Enviando a LSP: ${message.method || 'response'}`);
        this.lspProcess.stdin.write(header + content);
    }

    /**
     * Distribuye un mensaje a todos los clientes conectados
     * 
     * @description Envía el mensaje a todos los clientes WebSocket activos,
     *              limpiando automáticamente las conexiones muertas.
     * @param {Object} message - Mensaje JSON-RPC a broadcast
     * @returns {void}
     */
    broadcast(message) {
        const messageStr = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                try {
                    client.send(messageStr);
                } catch (e) {
                    console.error('[LSPMultiplexer] Error enviando a cliente:', e);
                    this.clients.delete(client);
                }
            } else {
                this.clients.delete(client);
            }
        });
    }

    /**
     * Programa el apagado automático del servidor
     * 
     * @description Cuando no hay clientes conectados, inicia un temporizador
     *              que terminará el proceso después del tiempo de inactividad
     *              configurado, a menos que llegue un nuevo cliente.
     * @returns {void}
     */
    scheduleShutdown() {
        const idleTimeout = parseInt(process.env.IDLE_TIMEOUT) || 300000;
        console.log(`[LSPMultiplexer] Sin clientes, programando shutdown en ${idleTimeout/1000}s`);
        
        setTimeout(() => {
            if (this.clients.size === 0) {
                console.log('[LSPMultiplexer] Shutdown por inactividad');
                if (this.lspProcess) {
                    this.lspProcess.kill();
                }
                process.exit(0);
            }
        }, idleTimeout);
    }
}

// Iniciar multiplexor
const port = parseInt(process.env.LSPMUX_PORT) || 3000;
new LSPMultiplexer(port);