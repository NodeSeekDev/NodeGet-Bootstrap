# nodeget worker

本worker用于处理一些基础的server任务，包括
- http请求
- 获取ip
- 清理过期的数据

## 环境变量
- token: 默认为：superToken
- resource_url: 资源下载地址前缀，默认空

## http路由接口
无

## rpc call接口


### http请求任务

请求
```json
{
  "task":{
    "name":"http_request",
    "data":{
      "url":"Your URL",
      "method":"GET",
      "body":""
    }
  }
}
```

返回

```json
{
    "body_base64": "base encode string",
    "headers": [
      {
        "content-type": "text/plain;charset=UTF-8"
      },
      {
        "content-length": "11"
      },
      ...
    ],
    "status": 200
  }
```

### ip任务

请求
```json
{
  "task":{
    "name":"ip",
  }
}
```
返回

```json
{
    "address": "",
    "asOrganization": "",
    "asn": 123,
    "location": {
      "city": "",
      "colo": "",
      "country": "",
      "geographicCoordinate": {
        "latitude": "",
        "longitude": ""
      },
      "postalCode": "",
      "timezone": ""
    }
}
```

### 数据清理任务
请求
```json
{
  "task":{
    "name":"clean_up_database",
  }
}
```