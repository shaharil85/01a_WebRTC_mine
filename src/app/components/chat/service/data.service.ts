import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Message } from '../types/message';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

export const WS_ENDPOINT = 'ws://localhost:8081';
//export const WS_ENDPOINT = 'ws://https://asqsolution.com:8081';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  private socket$: WebSocketSubject<Message>;
  private messageSubject  = new Subject<Message>();
  public message$ = this.messageSubject.asObservable();

  constructor() { }
  public connect():void{
    this.socket$ = this.getNewWebSocket();
    this.socket$.subscribe(
      // Called whenever there is a message from the server
      msg => {
        console.log('Received message of type: ' + msg.type);
        this.messageSubject.next(msg);
      }
    );

  }

  sendMessage(msg: Message): void {
    console.log('sending message: ' + msg.type)
    this.socket$.next(msg);
  }

  getNewWebSocket(): WebSocketSubject<any>{
    return webSocket({
      url: WS_ENDPOINT,
      openObserver:{
        next: ()=>{
          console.log('DataService: connection OK');
        }
      },
      closeObserver:{
        next:()=>{
          console.log('DataService: connection closed');
          this.socket$ = undefined;
          this.connect();
        }
      }

    })
  }
}
