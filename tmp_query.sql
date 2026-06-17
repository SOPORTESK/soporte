SELECT w.url, w.enabled, w.events FROM Webhook w JOIN "Instance" i ON w."instanceId" = i.id WHERE i."instanceName" = 'sekunet';
