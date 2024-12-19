import i18 from '@src/util/libs/locale';

import helloWorldi18en from './langs/en/helloWorld';
import helloWorldi18ptBR from './langs/pt-BR/helloWorld';

i18.install('en', helloWorldi18en);
i18.install('pt-BR', helloWorldi18ptBR);
