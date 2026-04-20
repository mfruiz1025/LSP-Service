// server.js - VERSIDAD CORREGIDA
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

class LSPMultiplexer {
    constructor(port = 3000) {
        this.port = port;
        this.language = process.env.LANGUAGE || 'python';
        this.workDir = process.env.WORKDIR || '/workspace';
        this.lspProcess = null;
        this.clients = new Set();
        this.isInitialized = false;
        this.maxClients = parseInt(process.env.MAX_CLIENTS) || 4;
        this.cachedCapabilities = {};
        
        // Buffer para mensajes LSP incompletos
        this.lspBuffer = '';
        this.contentLength = null;
        
        this.startLSP();
        this.setupWebSocket();
    }

    startLSP() {
        const lspConfig = this.getLSPConfig();
        
        console.log(`[LSPMultiplexer] Iniciando ${this.language} LSP`);
        console.log(`[LSPMultiplexer] Comando: ${lspConfig.command} ${lspConfig.args.join(' ')}`);
        
        this.lspProcess = spawn(lspConfig.command, lspConfig.args, {
            cwd: this.workDir,
            env: { ...process.env, ...lspConfig.env }
        });

        this.lspProcess.stderr.on('data', (data) => {
            console.error(`[LSP] stderr: ${data.toString()}`);
        });

        this.lspProcess.on('close', (code) => {
            console.log(`[LSP] Proceso terminado con código ${code}`);
            this.lspProcess = null;
            this.isInitialized = false;
            
            this.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.close(1011, 'LSP process terminated');
                }
            });
            this.clients.clear();
        });

        // CORRECCIÓN: Manejar mensajes LSP con formato Content-Length
        this.lspProcess.stdout.on('data', (data) => {
            this.handleLSPData(data.toString());
        });
    }

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
                    
                    // Cachear capacidades
                    if (message.id && message.result && message.result.capabilities) {
                        this.cachedCapabilities = message.result.capabilities;
                        console.log('[LSP] Capacidades cacheadas');
                    }
                    
                    // Broadcast a todos los clientes
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

    setupWebSocket() {
        this.wss = new WebSocketServer({ 
            port: this.port,
            host: '0.0.0.0'
        });

        console.log(`[LSPMultiplexer] WebSocket escuchando en puerto ${this.port}`);
        console.log(`[LSPMultiplexer] Máximo de clientes: ${this.maxClients}`);

        this.wss.on('connection', (ws, req) => {
            if (this.clients.size >= this.maxClients) {
                console.warn(`[LSPMultiplexer] Cliente rechazado: límite alcanzado (${this.maxClients})`);
                ws.close(1013, `Maximum clients reached (${this.maxClients})`);
                return;
            }

            const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            console.log(`[LSPMultiplexer] Nuevo cliente conectado: ${clientId}`);
            console.log(`[LSPMultiplexer] Total clientes: ${this.clients.size + 1}/${this.maxClients}`);
            
            this.clients.add(ws);
            
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

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleClientMessage(ws, message);
                } catch (e) {
                    console.error(`[${clientId}] Error parseando mensaje:`, e);
                }
            });

            ws.on('close', () => {
                console.log(`[LSPMultiplexer] Cliente desconectado: ${clientId}`);
                this.clients.delete(ws);
                console.log(`[LSPMultiplexer] Clientes restantes: ${this.clients.size}/${this.maxClients}`);
                
                if (this.clients.size === 0) {
                    this.scheduleShutdown();
                }
            });

            ws.on('error', (error) => {
                console.error(`[${clientId}] Error WebSocket:`, error);
                this.clients.delete(ws);
            });
        });
    }

    handleClientMessage(ws, message) {
        if (message.method === 'initialize') {
            if (!this.isInitialized) {
                console.log('[LSPMultiplexer] Primera inicialización del LSP');
                this.isInitialized = true;
                this.sendToLSP(message);
            } else {
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

        if (this.lspProcess && this.lspProcess.stdin.writable) {
            this.sendToLSP(message);
        }
    }

    sendToLSP(message) {
        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
        
        console.log(`[LSPMultiplexer] Enviando a LSP: ${message.method || 'response'}`);
        this.lspProcess.stdin.write(header + content);
    }

    broadcast(message) {
        const messageStr = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === 1) {
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