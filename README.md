# Release Management Assistant CLI

CLI en Node.js para observar y correlacionar historias Jira con Pull Requests de Bitbucket, y generar análisis estructurado con Gemini para proyectos Salesforce sin pipeline automatizado.

## Estado

Esta versión es una `v1` enfocada en:

- observación
- correlación Jira + Bitbucket
- análisis de archivos cambiados
- detección de aprobaciones
- clasificación Core / Industries
- detección preliminar de PreDeploy / PostDeploy
- resumen estructurado con Gemini

No ejecuta despliegues reales ni cambios destructivos por defecto.

## Requisitos

- Node.js 18.17+ recomendado
- WSL o Linux terminal
- archivo `.env` con credenciales válidas

## Instalación

```bash
node -v
cp .env.example .env
node src/main.js help
```

Este proyecto no requiere dependencias externas en esta primera versión.

## Variables de entorno

Revisa `.env.example`. Variables principales:

- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `BITBUCKET_BASE_URL`
- `BITBUCKET_WORKSPACE`
- `BITBUCKET_USERNAME`
- `BITBUCKET_APP_PASSWORD`
- `BITBUCKET_REPO`
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-2.5-flash`
- `SAFE_MODE=true`

## Comandos principales

```bash
node src/main.js jira ticket TLC-500
node src/main.js jira watch
node src/main.js bitbucket repos
node src/main.js bitbucket prs --repo my-repo
node src/main.js bitbucket pr analyze --repo my-repo --pr 123 --ticket TLC-500
node src/main.js bitbucket pr comment --repo my-repo --pr 123 --message "Listo para revisión"
node src/main.js bitbucket pr approve --repo my-repo --pr 123 --confirm
node src/main.js jira transition --ticket TLC-500 --transition 31 --confirm
node src/main.js release scan
node src/main.js release status
node src/main.js monitor start --interval 120000
node src/main.js monitor stop
```

## Qué analiza esta v1

Cuando detecta una historia candidata en `Release Manager`, intenta:

1. leer ticket Jira
2. ubicar PR abierto por ticket key en rama o título
3. revisar aprobación de reviewers autorizados
4. inspeccionar `files changed`
5. clasificar cambios en:
   - `force-app/` => Salesforce Core
   - `Vlocity/` => Salesforce Industries
   - ambos => Core + Industries
6. detectar:
   - `PreDeploySteps.md`
   - `PostDeploySteps.md`
   - archivos con `Pre`
   - archivos con `Post`
7. generar análisis JSON con Gemini

## Seguridad

- no loguea secretos
- usa `SAFE_MODE=true` por defecto
- deja listas las acciones de aprobar PR y transicionar Jira, pero no las dispara automáticamente
- aplica timeouts y retries ligeros en lecturas

## Estructura

```text
src/
  cli/
  domain/
  services/
  utils/
data/
```

## Siguientes pasos sugeridos

- probar conectividad real con Jira, Bitbucket y Gemini
- ajustar JQL por tablero si hiciera falta más precisión
- refinar correlación ticket <-> repo <-> PR
- preparar fase 2 con dry-run reforzado para validaciones de despliegue
