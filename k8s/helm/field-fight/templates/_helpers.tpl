{{- define "field-fight.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "field-fight.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "field-fight.labels" -}}
app.kubernetes.io/name: {{ include "field-fight.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: field-fight
{{- end -}}

{{- define "field-fight.selectorLabels" -}}
app.kubernetes.io/name: {{ include "field-fight.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "field-fight.backendName" -}}
{{- printf "%s-%s" (include "field-fight.fullname" .root) .service -}}
{{- end -}}

{{- define "field-fight.secretName" -}}
{{- default (printf "%s-secrets" (include "field-fight.fullname" .)) .Values.secrets.existingSecret -}}
{{- end -}}

{{- define "field-fight.imageRepository" -}}
{{- $accountId := required "registry.accountId is required" .Values.registry.accountId -}}
{{- $region := required "registry.region is required" .Values.registry.region -}}
{{- $prefix := required "registry.repositoryPrefix is required" .Values.registry.repositoryPrefix -}}
{{- printf "%s.dkr.ecr.%s.amazonaws.com/%s-%s" $accountId $region $prefix .suffix -}}
{{- end -}}

{{- define "field-fight.imageRef" -}}
{{- $root := .root -}}
{{- $image := .image -}}
{{- $tag := required "imageTag or service image.tag is required" (default $root.Values.imageTag $image.tag) -}}
{{- printf "%s:%s" (include "field-fight.imageRepository" (dict "Values" $root.Values "suffix" $image.suffix)) $tag -}}
{{- end -}}

{{- define "field-fight.imageTag" -}}
{{- $image := .image -}}
{{- required "imageTag or service image.tag is required" (default .root.Values.imageTag $image.tag) -}}
{{- end -}}

{{- define "field-fight.migrationJobName" -}}
{{- $tag := include "field-fight.imageTag" (dict "root" . "image" .Values.migrations.image) -}}
{{- printf "%s-migrations-%s" (include "field-fight.fullname" .) ($tag | lower | replace "_" "-" | trunc 12 | trimSuffix "-") | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "field-fight.frontendNginx" -}}
server {
    listen 80;

    location / {
        root   /usr/share/nginx/html;
        index  index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://{{ include "field-fight.backendName" (dict "root" . "service" "leaderboard-api") }}:3000;
        proxy_set_header Host $host;
    }

    location /auth/ {
        proxy_pass http://{{ include "field-fight.backendName" (dict "root" . "service" "auth-service") }}:3000;
        proxy_set_header Host $host;
    }

    location /matches {
        proxy_pass http://{{ include "field-fight.backendName" (dict "root" . "service" "match-history-service") }}:3000;
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://{{ include "field-fight.backendName" (dict "root" . "service" "game-server") }}:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
{{- end -}}
