# chatroom-backend
An anonymous chatroom backend mainly based on node.js and websocket

# 使用
clone该项目
把apikey和域名换成自己的
给域名申请SSL证书和私钥，参考步骤如下：
```bash
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
~/.acme.sh/acme.sh --issue -d ws.tianba.tk --standalone # 执行这步要确保80端口没被占用
~/.acme.sh/acme.sh --installcert -d ws.tianba.tk --ca-file /etc/nginx/conf/ssl/ca.cer --cert-file /etc/nginx/conf/ssl/ws.tianba.tk.cer --key-file /etc/nginx/conf/ssl/ws.tianba.tk.key --fullchain-file /etc/nginx/conf/ssl/fullchain.cer
```
执行`node chat.js`开始监听

# 致谢
+ [icheer/chatroom-backend](https://github.com/icheer/chatroom-backend)
