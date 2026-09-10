export class BubbleController {
  constructor(messages = []) {
    this.messages = messages.length ? messages : [
      '你好呀',
      '今天也辛苦啦',
      '记得休息一下'
    ];
    this.visible = false;
  }

  randomMessage() {
    return this.messages[Math.floor(Math.random() * this.messages.length)];
  }

  show() {
    this.visible = true;
    return this.randomMessage();
  }

  hide() {
    this.visible = false;
  }
}
