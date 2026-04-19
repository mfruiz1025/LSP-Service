# USO DEL SERVIDOR DE LENGUAJE


# USO DEL CONTENEDOR DEL LSP
El proposito de usarlo manualmente debe ser para probar su funcionamiento, en la operacion debe ser totalmente controlado por el SERVIDOR DE LENGUAJE

1. Constuir la imagen
```
docker build -t lsp-server:latest 
```
2. Probar con uno de los LSP descargados en el contenedor

**Python**

```
docker run --rm -e LANGUAGE=python lsp-server:latest
```

**C++**

```
docker run --rm -it -e LANGUAGE=cpp lsp-server:latest
```

**Typescript**

```
docker run --rm -it -e LANGUAGE=typescript lsp-server:latest
```

3. Probar si los procesos se estan ejecutando

**Python**

```
docker exec <ID CONTENEDOR> bash -c "ps aux | grep pylsp"
```

**C++**

```
docker exec <ID CONTENEDOR> bash -c "ps aux | grep clangd"
```



**Typescript**

```
docker exec <ID CONTENEDOR> bash -c "ps aux | grep typescript"
```

