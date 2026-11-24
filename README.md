# DevOps Final Project — КТ 4

Учебный проект: Node.js, Docker, GitHub Actions, Prometheus, Grafana, Ansible.

## 1. Запуск приложения и мониторинга

```bash
npm install
npm run lint
npm test
docker compose up -d --build
```

| Адрес | Результат |
|---|---|
| http://localhost:3000/ | DevOps Final Project |
| http://localhost:3000/health | `{"status":"ok"}` |
| http://localhost:3000/metrics | Метрики prom-client и http_requests_total |
| http://localhost:9090/targets | Цель app, статус UP |
| http://localhost:3001 | Grafana, учебный логин admin/admin |

Grafana автоматически получает источник данных Prometheus. В Explore выберите Prometheus и выполните запрос `up{job="app"}` или `sum(rate(http_requests_total[1m]))`. Учебные порты и пароль предназначены для локальной среды, не для публичного сервера.

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/metrics
docker compose ps
```

Dockerfile сначала копирует манифест зависимостей, затем устанавливает зависимости и только потом копирует код. Это позволяет использовать кэш Docker. При наличии package-lock.json используется npm ci. Lock-файл не включён, поскольку в среде подготовки не было доступа к npm registry; после первого npm install его рекомендуется закоммитить.

## 2. CI/CD и GitHub

Репозиторий: https://github.com/mrDisa/devops-final. Ветки `main` и `develop` созданы. Первый PR из `develop` в `main` смержен: https://github.com/mrDisa/devops-final/pull/1. Активная защита `main` требует PR и успешные проверки `lint` и `test`.

1. Откройте Actions и дождитесь успешных lint и test на develop.
2. Settings → Branches → Add branch protection rule: шаблон `main`, Require a pull request before merging и Require status checks to pass before merging. Выберите `lint` и `test` после их первого запуска. Не требуйте build-and-push: этот job намеренно пропускается на PR.
3. Создайте Pull Request из develop в main, дождитесь зелёных lint и test, выполните Merge.
4. На push в main выполнится build-and-push. В Packages появится образ `ghcr.io/<owner>/devops-final` с тегами `latest` и полным SHA коммита.

Pipeline содержит ровно три job: lint (проверка синтаксиса JS), test (Node.js тесты, сервис PostgreSQL 16 с health check, интеграционная проверка Docker/Grafana/Prometheus и два запуска Ansible), build-and-push (публикация GHCR только для push в main). PostgreSQL используется как требуемый CI service; само приложение не хранит данные в БД.

## 3. Ansible

Плейбук рассчитан на Ubuntu 24.04 с systemd (не непосредственно на iOS или macOS). Остановите первый локальный стек перед запуском, иначе порты будут заняты.

```bash
docker compose down
sudo apt-get update && sudo apt-get install -y ansible
ansible-playbook -i localhost, deploy.yml --ask-become-pass
ansible-playbook -i localhost, deploy.yml --ask-become-pass
```

Плейбук проверяет Docker Compose, устанавливает Docker при необходимости, создаёт `/opt/devops-final`, копирует конфигурации и исходники, собирает образ при изменении файлов и запускает `docker compose up -d`. Повторный запуск без изменений должен показать `changed=0` и `failed=0`. На GitHub Actions эти команды выполняются автоматически; логи сохраняются как artifact `ansible-logs`.

## 4. Доказательства для сдачи

После реального успешного запуска приложите скриншоты:
- ответы curl на три маршрута, docker compose ps;
- Prometheus Targets со статусом UP, Grafana с подключённым источником;
- GitHub Actions на PR и после merge, Branch protection, GHCR с обоими тегами;
- вывод первого и повторного Ansible playbook (из Actions → test → Verify Ansible and idempotence).

В Actions → успешный запуск CI/CD → Artifacts скачайте **devops-evidence-test** и **devops-evidence-ghcr**. В них находятся PNG-скриншоты реальных страниц приложения, Prometheus Targets и ответа Grafana, а также явно подписанные HTML/PNG-протоколы фактического вывода Docker, обоих запусков Ansible, состояния PR/защиты main и успешной публикации GHCR. Протоколы содержат SHA исходников и ссылку на запуск. Исходные логи Ansible также доступны в **ansible-logs**.

Скриншоты создаются в CI на Ubuntu, где запускается Docker Compose; после проверки временный стек останавливается. Постоянный публичный сервер этим заданием не требуется.

Проверенный базовый запуск: https://github.com/mrDisa/devops-final/actions/runs/45434246238. В нём все три jobs успешны, Prometheus возвращает `up=1`, Grafana подтверждает подключение к Prometheus, первый Ansible run — `changed=4, failed=0`, повторный — `changed=0, failed=0`. Образ опубликован как `ghcr.io/mrdisa/devops-final:latest` и `ghcr.io/mrdisa/devops-final:5b3f41a2f8a60328aa421fdf2973e4ca434c6196`.

Скрипт `scripts/capture-evidence.js` использует Playwright только для снимков и проверяет ответы сервисов перед сохранением доказательств. Он запускается после основных тестов, для `build-and-push` — только после успешной публикации образа.
