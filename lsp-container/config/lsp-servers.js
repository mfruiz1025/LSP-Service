export const servers = [
    {
        name: 'Python LSP',
        endpoint: 'python',
        command: 'pylsp',
        args: [],
        workDir: '/workspace',
        translatePaths: true,
        env: {
            PYTHONPATH: '/workspace'
        }
    },
    {
        name: 'C++ Clangd',
        endpoint: 'cpp',
        command: 'clangd',
        args: [
            '--compile-commands-dir=/workspace',
            '--background-index',
            '--clang-tidy'
        ],
        workDir: '/workspace',
        translatePaths: true,
        env: {}
    },
    {
        name: 'TypeScript/JavaScript',
        endpoint: 'typescript',
        command: 'typescript-language-server',
        args: ['--stdio'],
        workDir: '/workspace',
        translatePaths: true,
        env: {}
    }
];