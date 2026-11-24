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

Создайте публичный репозиторий `devops-final` (например, с пустым README для появления main). Ветка develop создаётся от main. Загрузите содержимое архива в develop, сохранив структуру каталогов, включая `.github/workflows/ci-cd.yml` и скрытые файлы.

На телефоне распакуйте ZIP в приложении «Файлы». Через браузер GitHub (при необходимости включите версию для компьютера) используйте Add file → Upload files. Если загрузчик не сохраняет каталоги или скрытые файлы, используйте Add file → Create new file с полным путём и вставьте содержимое нужного файла. Не загружайте ZIP как единственный файл репозитория: workflow тогда не запустится.

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

Скриншоты и успешные результаты не приложены заранее: необходимо получить их при настоящем запуске. CI автоматически проверяет доступность всех трёх сервисов, статус цели Prometheus, подключение источника Grafana и идемпотентность.
