FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Instala dependencias base
RUN apt-get update && apt-get install -y \
    clangd \
    python3 python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instala Node.js 18 (versión LTS estable)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Instala servidores LSP
RUN pip3 install python-lsp-server
RUN npm install -g typescript-language-server typescript

WORKDIR /workspace

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]