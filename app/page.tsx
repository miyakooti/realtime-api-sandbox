
"use client"

import { useEffect, useRef, useCallback, useState } from 'react';


import { RealtimeClient } from "@openai/realtime-api-beta";
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';

import { WavRecorder, WavStreamPlayer } from '@/lib/wavtools/index';

const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';


export default function AudioTalk (){

  const apiKey = process.env.OPENAI_API_KEY

  const client = new RealtimeClient({ 
      apiKey: apiKey,
      dangerouslyAllowAPIKeyInBrowser: true 
  })

  

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
    const wavRecorderRef = useRef<WavRecorder>(
      new WavRecorder({ sampleRate: 24000 })
    );
    const wavStreamPlayerRef = useRef<WavStreamPlayer>(
      new WavStreamPlayer({ sampleRate: 24000 })
    );
    const clientRef = useRef<RealtimeClient>(
      new RealtimeClient(
        LOCAL_RELAY_SERVER_URL
          ? { url: LOCAL_RELAY_SERVER_URL }
          : {
              apiKey: apiKey,
              dangerouslyAllowAPIKeyInBrowser: true,
            }
      )
    );

  const wavRecorder = new WavRecorder({ sampleRate: 24000 })
  const wavStreamPlayer = new WavStreamPlayer({ sampleRate: 24000 })

  const [isConnected, setIsConnected] = useState(false)
  const [items, setItems] = useState<ItemType[]>([]);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    setIsConnected(true);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`,
        // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  const disconnectConversation = useCallback(async () => {
      setIsConnected(false);
      setItems([]);
  
      client.disconnect();
  
      await wavRecorder.end();
  
      await wavStreamPlayer.interrupt();
  }, []);

  /**
 * Core RealtimeClient and audio capture setup
 * Set all of our instructions, tools, events and more
 */
  useEffect(() => {

    // Set instructions
    client.updateSession({ instructions: 'あなたは役にたつAIアシスタントです' });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });
    // ユーザーが話終えたことをサーバー側で判断する'server_vad'に設定。（'manual'モードもある）
    client.updateSession({turn_detection:{type:'server_vad'}})

    // 不要
    client.on('error', (event: any) => console.error(event));

    console.log(client)

    // 必要
    client.on('conversation.interrupted', async () => {
      console.log('interrupted')
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });

    // 必要
    client.on('conversation.updated', async ({ item, delta }: any) => {
      console.log('convesation.updated')
      const items = client.conversation.getItems();
      console.log('items',items)
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  

  return (
      <>
          <h1>最小限のrealtime APIを試す</h1>

          <div>
          {items.map(item=>{
              return (<>
              <div>{item.role}：{JSON.stringify(item.formatted.transcript)}</div>
              </>)
          })}
          </div>

          <div>
          {isConnected? 
              <button onClick={disconnectConversation}>停止</button>:
              <button onClick={connectConversation}>録音開始</button>
          }

          </div>
          
      </>
  )
}