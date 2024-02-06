import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from "ai";
import OpenAI from "openai";
import type { ChatCompletionCreateParams } from "openai/resources/chat";
import { defineEventHandler, defineLazyEventHandler, readBody } from "h3";
import { getServerConfig } from "../config/server";

const functions: ChatCompletionCreateParams.Function[] = [
  {
    name: "get_current_weather",
    description: "Get the current weather.",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "The temperature unit to use.",
        },
      },
      required: ["format"],
    },
  },
  {
    name: "eval_code_in_browser",
    description: "Execute javascript code in the browser with eval().",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: `Javascript code that will be directly executed via eval(). Do not use backticks in your response.
           DO NOT include any newlines in your response, and be sure to provide only valid JSON when providing the arguments object.
           The output of the eval() will be returned directly by the function.`,
        },
      },
      required: ["code"],
    },
  },
];

export default defineLazyEventHandler(async () => {
  const { OPENAI_API_KEY } = getServerConfig();
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OpenAI API key");
  }
  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

  return defineEventHandler(async (event: any) => {
    const { messages } = await readBody(event);

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0613",
      stream: true,
      messages,
      functions,
    });

    // eslint-disable-next-line new-cap
    const data = new experimental_StreamData();
    const stream = OpenAIStream(response, {
      experimental_onFunctionCall: async (
        { name, arguments: args },
        createFunctionCallMessages,
      ) => {
        if (name === "get_current_weather") {
          // Call a weather API here
          const weatherData = {
            temperature: 20,
            unit: args.format === "celsius" ? "C" : "F",
          };

          data.append({
            text: "Some custom data",
          });

          const newMessages = createFunctionCallMessages(weatherData);
          return openai.chat.completions.create({
            messages: [...messages, ...newMessages],
            stream: true,
            model: "gpt-3.5-turbo-0613",
          });
        }
      },
      onCompletion(completion) {
        console.log("completion", completion);
      },
      onFinal(_completion) {
        data.close();
      },
      experimental_streamData: true,
    });

    data.append({
      text: "Hello, how are you?",
    });

    return new StreamingTextResponse(stream, {}, data);
  });
});
