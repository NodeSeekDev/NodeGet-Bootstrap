# nodeget tg bot worker

本worker用于telegram机器人，监听用户命令，及发送通知，包括

- 离线通知
- 到期提醒

使用方式，先在 [@BotFather](https://t.me/BotFather)获取一个tg bot token
然后通过[@getmyid_bot](https://t.me/BotFather)获得自己的tg uid
编辑下面的环境变量，添加3个关键属性，botToken、botSecret、adminUid

手动打开下面的链接注册tg bot webhook

https://{你的后端域名}/worker-route/{本worker绑定的路由}/registerWebhook

## 环境变量
- botToken: telegram bot token
- botSecret: 随机字符串
- adminUid: 管理员id

## http路由接口
无

## rpc call接口

### 发送消息的接口

注：支持同样的inlineCall参数

请求
```json
{
  "task":{
    "name":"send-message",
    "message": // your telegram message object
  }
}
```

返回

```json
{
    "ok": true,
    "task": // received task
  }
```
